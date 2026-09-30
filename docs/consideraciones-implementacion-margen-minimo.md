# Consideraciones Específicas de Implementación para la Integración de Margen Mínimo

## Actividad 1: Evaluación de Proceso de Reducción de Margen Mínimo

### Consideraciones Técnicas

**1.1 Análisis de Dependencias Existentes**
- **SP Actual:** `[EMPRESA].SP_GESTION_LISTAS_PRECIOS_FULL` ya incluye validación básica de margen mínimo
- **Tablas Afectadas:** `ARTICULO_PRECIO`, `ARTICULO`, `VERSION_NIVEL`, `GESTION_LISTAS_PRECIOS`
- **Jobs Programados:** Evaluar impacto en job "Actualiza Lista Precios(Todas)" que ejecuta diariamente
- **Métricas de Performance:** Medición actual de tiempos de ejecución para establecer línea base

**1.2 Requerimientos de Negocio a Validar**
- **Márgenes Diferenciales por País:** Costa Rica vs. Venezuela vs. Colombia pueden tener políticas distintas
- **Categorías con Tratamiento Especial:** Productos farmacéuticos, alimentos, electrónicos pueden requerir márgenes regulados
- **Excepciones Temporales:** Campañas promocionales con márgenes reducidos por tiempo limitado
- **Niveles de Aprobación:** Quién autoriza excepciones a márgenes mínimos (Gerencia Comercial, Finanzas, etc.)

**1.3 Consideraciones de Arquitectura**
- **Compatibilidad Retroactiva:** El nuevo sistema debe poder procesar lotes históricos para recalcular márgenes
- **Interfaz de Usuario:** Definición de pantallas para configuración y monitoreo de márgenes mínimos
- **APIs de Integración:** Consumo de márgenes mínimos por sistemas externos (AFV, catálogos digitales)
- **Almacenamiento de Histórico:** Política de retención de cambios a márgenes mínimos (90 días, 1 año, permanente)

**1.4 Riesgos a Mitigar**
- **Datos Inconsistentes:** Artículos sin costo promedio válido o con costos negativos
- **Monedas Múltiples:** Conversión de márgenes entre dólar y moneda local
- **Artículos Descontinuados:** Tratamiento de productos inactivos en catálogo
- **Cambios Masivos:** Impacto de actualizar 100,000+ márgenes simultáneamente

---

## Actividad 2: Uso de la UDF real COFER.U_FACTOR_REDUCCION_MARGEN

### Consideraciones de Diseño

**2.1 Estructura de Datos Real (UDF de Softland)**
```sql
-- Fuente única de excepciones (reemplaza la UDT teórica previa)
CREATE TABLE [COFER].[U_FACTOR_REDUCCION_MARGEN] (
    U_CODIGO   VARCHAR(260) NOT NULL,   -- código de artículo (equivale a ARTICULO)
    U_DESCRIP  VARCHAR(260) NOT NULL,   -- descripción del artículo
    U_FACTOR_REDUCCION DECIMAL(18,2) NULL,  -- PORCENTAJE explícito: 10.00 = 10%
    U_ACTIVO   VARCHAR(1) NOT NULL,     -- 'S' = excepción vigente
    NoteExistsFlag TINYINT NOT NULL,
    RecordDate DATETIME NOT NULL,
    RowPointer UNIQUEIDENTIFIER NOT NULL,
    CreatedBy VARCHAR(30) NOT NULL,
    UpdatedBy VARCHAR(30) NOT NULL,
    CreateDate DATETIME NOT NULL,
    CONSTRAINT PK_U_FACTOR_REDUCCION_MARGEN PRIMARY KEY CLUSTERED (U_CODIGO, U_DESCRIP)
);

-- Índice de apoyo para la búsqueda del factor activo por artículo
CREATE INDEX IX_UFRM_CODIGO_ACTIVO
    ON U_FACTOR_REDUCCION_MARGEN (U_CODIGO, U_ACTIVO)
    INCLUDE (U_FACTOR_REDUCCION);
```

**Contrato de entrada y representación**
- La plantilla de margen recibe `Porcentaje Reduccion`: `10`, `20` o `10.5`; el rango válido es `[0, 100)`.
- La UDF persiste el **porcentaje explícito**: `10` → `10.00`, `10.5` → `10.50`. No se altera la precisión `DECIMAL(18,2)` de la columna.
- El SP y la lógica Python dividen `U_FACTOR_REDUCCION / 100.0` **solo al calcular** para obtener el factor normalizado (`0.10`, `0.105`).
- Si el artículo no tiene excepción activa, se aplica el `10%` por defecto (`0.10`).
- El multiplicador efectivo es `1 − factor normalizado`; por tanto, `10%` aplica `0.90` sobre el margen promedio.
- La UDF no maneja rangos de fechas: la vigencia se determina solo por `U_ACTIVO = 'S'`.
- Esta semántica no modifica los factores de precio `0.95` y `1.10`, que son multiplicadores directos de precio.

**2.1.1 Arquitectura multiempresa / multibase de datos**
- Cada compañía tiene su propia base de datos Softland; el backend resuelve la cadena de conexión y el esquema según la compañía del contexto de la solicitud (`EnrutadorCompania` en `backend/api/db_routing.py`).
- El SP `SP_CALCULAR_MARGEN_MINIMO_ARTICULO`, la lectura de la UDF y las actualizaciones a `ARTICULO_PRECIO` se ejecutan sobre el catálogo de la compañía activa.
- Las credenciales se inyectan desde configuración segura (Parameter Store / Secrets Manager); no se codifica una compañía fija.

**2.2 Consideraciones de Performance**
- **Volumen Esperado:** Estimado 5-10% de artículos con factor específico (~5,000-10,000 registros)
- **Frecuencia de Cambio:** 50-100 actualizaciones diarias durante campañas, 5-10 en operación normal
- **Tamaño de Registro:** ~150 bytes por registro, tamaño total estimado 1.5-3 MB
- **Crecimiento Anual:** ~10-20% considerando nuevo catálogo y promociones

**2.3 Reglas de Negocio a Implementar**
- **Validación de Solapamientos:** No permitir rangos de fechas solapados para mismo artículo
- **Factor por Defecto:** Si no existe registro activo para artículo, aplicar 10% general
- **Jerarquía de Factores:** Artículo específico > Categoría > Línea > Global
- **Auditoría de Cambios:** Mantener historial completo de modificaciones (opcional tabla de log)

**2.4 Consideraciones de Mantenimiento**
- **Proceso de Purga:** Eliminar registros inactivos con FECHA_FIN > 2 años
- **Respaldo Incremental:** Incluir en backups diarios diferenciales
- **Monitoreo:** Alertas por factores > 50% o duraciones > 365 días
- **Documentación:** Mantener diccionario de datos actualizado en repositorio de documentación

---

## Actividad 3: Creación de Stored Procedure SP_CALCULAR_MARGEN_MINIMO_ARTICULO

### Consideraciones de Implementación

**3.1 Algoritmo de Cálculo**

```sql
-- Pseudocódigo del algoritmo principal
BEGIN
    -- Paso 1: Obtener precios base y costos activos
    -- Paso 2: Calcular margen promedio por artículo
    -- Paso 3: Buscar U_FACTOR_REDUCCION (porcentaje) en COFER.U_FACTOR_REDUCCION_MARGEN (U_ACTIVO='S'); normalizar /100.0
    -- Paso 4: Aplicar fórmula: Margen_Mínimo = Margen_Promedio × (1 - Factor_Reducción_normalizado)
    -- Paso 5: Validar márgenes calculados contra reglas de negocio
    -- Paso 6: Actualizar ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN
    -- Paso 7: Registrar log de operación y estadísticas
END
```

**3.2 Optimizaciones de Performance**

**3.2.1 Estrategias de Indexación**
- **Tabla temporal indexada:** para procesamiento intermedio de 50,000+ registros
- **Batch processing:** procesamiento en lotes de 5,000 registros para minimizar bloqueos
- **Query hints:** uso estratégico de (NOLOCK) en tablas de solo lectura
- **Plan de ejecución:** análisis y optimización con Database Engine Tuning Advisor

**3.2.2 Manejo de Transacciones**
- **Transacción única vs. múltiples:** evaluación basada en volumen y tiempo de rollback
- **Nivel de aislamiento:** READ COMMITTED para balance entre consistencia y concurrencia
- **Puntos de commit:** cada 1,000 registros para minimizar bloqueo prolongado
- **Recovery plan:** estrategia de reintento automático para errores transitorios

**3.3 Validaciones Críticas**

**3.3.1 Validaciones de Datos de Entrada**
- Precio base > 0
- Costo promedio ≥ 0
- Porcentaje de reducción en `[0, 100)` (equivale a factor normalizado en `[0, 1)`)
- Excepción vigente cuando `U_ACTIVO = 'S'` (la UDF no maneja rangos de fechas)

**3.3.2 Validaciones de Lógica de Negocio**
- Margen mínimo ≥ 0 (no permitir márgenes negativos)
- Margen mínimo ≤ Margen promedio (no puede ser mayor)
- Coherencia con márgenes históricos (variación máxima del 20% vs. último cálculo)
- Cumplimiento de políticas por país y categoría

**3.4 Manejo de Errores y Excepciones**

```sql
-- Estructura recomendada de manejo de errores
BEGIN TRY
    BEGIN TRANSACTION;
    
    -- Lógica principal
    
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    
    -- Log detallado del error
    INSERT INTO ERROR_LOG (SP_NAME, ERROR_NUMBER, ERROR_MESSAGE, ERROR_LINE, ERROR_PROCEDURE)
    VALUES ('SP_CALCULAR_MARGEN_MINIMO_ARTICULO', 
            ERROR_NUMBER(), 
            ERROR_MESSAGE(), 
            ERROR_LINE(), 
            ERROR_PROCEDURE());
    
    -- Re-lanzar error para manejo externo
    THROW;
END CATCH
```

**3.5 Consideraciones de Concurrencia**
- **Bloqueos:** Uso de tablas temporales para minimizar bloqueos en tablas productivas
- **Reintentos:** Lógica para manejar deadlocks con máximo 3 reintentos
- **Sesiones paralelas:** Validación de ejecuciones concurrentes desde diferentes usuarios
- **Resource Governor:** Considerar configuración si impacta performance de otros procesos

---

## Actividad 4: Pruebas de Stored Procedure de Reducción de Margen Mínimo

### Consideraciones de Calidad

**4.1 Estrategia de Pruebas**

**4.1.1 Ambiente de Pruebas**
- **QA Database:** Réplica de producción con datos anonimizados
- **Volumen de Datos:** 10% de datos productivos (~5,000 artículos)
- **Ciclo de Pruebas:** Desarrollo → QA Integrado → Pre-Producción → Producción
- **Herramientas:** SQL Server Data Tools (SSDT), tSQLt, Redgate SQL Test

**4.1.2 Tipos de Pruebas**
1. **Unitarias:** Funcionalidad individual de cálculo
2. **Integración:** Interacción con tablas existentes
3. **Rendimiento:** Tiempos de respuesta bajo carga
4. **Concurrencia:** Múltiples ejecuciones simultáneas
5. **Recovery:** Recuperación tras fallos
6. **Seguridad:** Permisos y accesos

**4.2 Casos de Prueba Críticos**

**4.2.1 Casos de Cálculo Básico**
| Escenario | Precio Base | Costo | Porcentaje ingresado | Factor normalizado | Margen Promedio | Margen Mínimo Esperado | Resultado Esperado |
|-----------|-------------|-------|----------------------|--------------------|-----------------|------------------------|--------------------|
| Caso Normal | 100.00 | 70.00 | 10 | 0.1000 | 30.00% | 27.00% | Éxito |
| Sin Factor Específico | 100.00 | 80.00 | — | 0.1000 default | 20.00% | 18.00% | Éxito (10% default) |
| Factor Cero | 100.00 | 75.00 | 0 | 0.0000 | 25.00% | 25.00% | Éxito |
| Ejemplo solicitado | 100.00 | 75.00 | 10 | 0.1000 / multiplicador 0.90 | 25.00% | 22.50% | Éxito; se persiste en ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN |

**4.2.2 Casos de Error y Borde**
| Escenario | Condición | Comportamiento Esperado |
|-----------|-----------|-------------------------|
| Precio Base Cero | Precio = 0 | Error "PRECIO_BASE_INVALIDO" |
| Costo Negativo | Costo < 0 | Error "COSTO_INVALIDO" |
| Porcentaje fuera de rango | Porcentaje = 100 | Error "PORCENTAJE_REDUCCION_FUERA_RANGO" |
| Porcentaje negativo | Porcentaje = -0.01 | Error "PORCENTAJE_REDUCCION_FUERA_RANGO" |
| Porcentaje no numérico o vacío | Texto o celda vacía | Error de validación de plantilla |
| Fechas Solapadas | Dos factores activos mismo período | Error "SOLAPAMIENTO_FECHAS" |
| Artículo Inexistente | Código no en catálogo | Error "ARTICULO_NO_EXISTE" |

**4.3 Pruebas de Rendimiento**

**4.3.1 Métricas Objetivo**
- **Tiempo de Ejecución:** < 30 segundos para 50,000 artículos
- **Uso de CPU:** < 70% promedio durante ejecución
- **Memoria:** < 500 MB de consumo adicional
- **Bloqueos:** 0 deadlocks en 100 ejecuciones concurrentes
- **Throughput:** 2,000 artículos/segundo en hardware objetivo

**4.3.2 Escenarios de Carga**
1. **Carga Ligera:** 1,000 artículos (pruebas funcionales)
2. **Carga Media:** 10,000 artículos (pruebas de integración)
3. **Carga Pesada:** 50,000 artículos (pruebas de rendimiento)
4. **Carga Extrema:** 100,000 artículos (pruebas de estrés)

**4.4 Pruebas de Concurrencia**

**4.4.1 Escenarios Concurrentes**
1. **Ejecución Simple:** Un usuario ejecuta SP
2. **Ejecución Paralela:** 3 usuarios ejecutan simultáneamente
3. **Lectura/Escritura:** SP ejecutando mientras otros usuarios consultan ARTICULO_PRECIO
4. **Modificación Concurrente:** SP ejecutando mientras se modifican factores en UDT

**4.4.2 Resultados Esperados**
- **Consistencia:** Todas las ejecuciones producen mismos resultados
- **Aislamiento:** Una ejecución no afecta datos de otra
- **Atomicidad:** Fallo en una ejecución no deja datos inconsistentes
- **Durabilidad:** Cambios persistidos sobreviven a reinicios

**4.5 Consideraciones de Automatización**

**4.5.1 Framework de Pruebas**
- **tSQLt:** Framework de pruebas unitarias para SQL Server
- **PowerShell:** Scripting para ejecución automatizada
- **Jenkins/Azure DevOps:** Pipelines de CI/CD
- **Base de Datos de Pruebas:** Restaurada automáticamente antes de cada ciclo

**4.5.2 Criterios de Aceptación**
- **Cobertura de Código:** > 85% de líneas de SP probadas
- **Casos de Éxito:** 100% de casos positivos aprobados
- **Casos de Error:** 100% de casos negativos manejados correctamente
- **Performance:** Todos los objetivos de rendimiento cumplidos
- **Estabilidad:** 0 crashes en 100 ejecuciones consecutivas

---

## Consideraciones Cruzadas para las 4 Actividades

### 5.1 Gestión de Cambio Organizacional

**5.1.1 Capacitación Requerida**
- **Usuarios Finales:** Gerentes comerciales, analistas de precios
- **Administradores:** DBA responsables de mantenimiento
- **Desarrolladores:** Equipo que mantendrá y extenderá la solución
- **Soporte:** Help desk que manejará incidencias

**5.1.2 Documentación Necesaria**
- **Manual de Usuario:** Configuración y uso de la funcionalidad
- **Guía Técnica:** Arquitectura y mantenimiento del sistema
- **Procedimientos Operativos:** Pasos para ejecución y monitoreo
- **Plan de Rollback:** Procedimiento para revertir cambios si es necesario

### 5.2 Consideraciones de Seguridad

**5.2.1 Permisos y Roles**
- **Solo Lectura:** Roles de consulta para análisis
- **Escritura Limitada:** Roles para configuración de factores
- **Ejecución:** Permisos específicos para ejecutar SP
- **Auditoría:** Roles para revisión de logs y cambios

**5.2.2 Protección de Datos**
- **Encriptación:** Considerar para factores comerciales sensibles
- **Máscara de Datos:** En ambientes no productivos
- **Logging Seguro:** Sin exposición de datos sensibles en logs
- **Control de Acceso:** Basado en roles y responsabilidades

### 5.3 Monitoreo y Mantenimiento Continuo

**5.3.1 Métricas de Monitoreo**
- **Disponibilidad:** % tiempo SP ejecutable sin errores
- **Performance:** Tiempos de ejecución históricos
- **Calidad de Datos:** % artículos con márgenes válidos
- **Uso:** Número de ejecuciones y usuarios activos

**5.3.2 Alertas Proactivas**
- **Degradación de Performance:** Aumento > 20% en tiempo de ejecución
- **Errores Consecutivos:** 3 fallos en 1 hora
- **Datos Anómalos:** Factores > 50% o márgenes < 0%
- **Espacio en Disco:** Uso > 80% en tablas relacionadas

### 5.4 Plan de Continuidad y Recuperación

**5.4.1 Estrategias de Backup**
- **Tablas UDT:** Backup diferencial diario + completo semanal
- **Procedimientos:** Incluidos en backup de esquema
- **Logs:** Retención de 90 días para auditoría
- **Snapshots:** Antes de cambios masivos o campañas importantes

**5.4.2 Procedimientos de Recovery**
- **Restauración Parcial:** Recuperación de tabla UDT sin afectar sistema completo
- **Re-cálculo Masivo:** Procedimiento para recalcular márgenes desde fecha específica
- **Migración de Datos:** Herramientas para mover configuración entre ambientes
- **Validación Post-Recovery:** Verificación automática de integridad tras recuperación

### 5.5 Evolución Futura y Escalabilidad

**5.5.1 Capacidades de Extensión**
- **Factores por Atributo:** Extender a categorías, líneas, proveedores
- **Políticas Jerárquicas:** Reglas complejas con prioridades
- **Integración Externa:** APIs para sistemas de pricing externos
- **Machine Learning:** Optimización automática basada en historial

**5.5.2 Plan de Escalabilidad**
- **Horizontal:** Particionamiento por país o categoría
- **Vertical:** Optimización de hardware y configuración SQL
- **Caché:** Considerar capa de caché para factores frecuentes
- **CDN:** Para márgenes consumidos por aplicaciones distribuidas

---

## Conclusión: Ruta Crítica de Implementación

1. **Semana 1-2:** Evaluación completa y diseño detallado
2. **Semana 3-4:** Desarrollo de tabla UDT y SP básico
3. **Semana 5-6:** Pruebas exhaustivas y optimizaciones
4. **Semana 7:** Capacitación y documentación
5. **Semana 8:** Implementación en pre-producción y validación
6. **Semana 9:** Go-Live controlado y monitoreo intensivo
7. **Semana 10+:** Optimización continua y soporte

**Criterio de Éxito Final:** Sistema operando con 99.9% disponibilidad, procesando 50,000 artículos en < 30 segundos, con 0 errores de cálculo en producción durante primer mes.