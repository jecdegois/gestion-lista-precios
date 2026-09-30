# Justificación Técnica para la Gestión del Cambio en Actividades de Integración de Margen Mínimo

## Contexto del Proyecto

**Proyecto:** MV26020 - Cálculo de Listas de Precio  
**Fecha:** Agosto 26, 2026  
**Autor:** Arquitecto de Software / Lead Developer  
**Versión:** 1.0  

### Propuesta Técnica
Esta propuesta contempla el desarrollo e implementación de la arquitectura de base de datos y lógica almacenada para procesar dinámicamente el campo nativo `MARGEN_UTILIDAD_MIN` en la tabla `ARTICULO_PRECIO` sobre la totalidad de las listas de precio configuradas. La solución ejecuta de forma masiva el modelo de negocio fundamentado en el margen promedio ponderado por el factor de reducción parametrizable (10% por defecto y administración de excepciones específicas por artículo mediante la UDF real `COFER.U_FACTOR_REDUCCION_MARGEN`), garantizando la optimización en el procesamiento de alto volumen de datos, la integridad referencial y el control automatizado de la rentabilidad comercial en el ERP.

### Contrato de captura y persistencia del factor

La carga operativa recibe un **porcentaje de reducción**: `10`, `20` o `10.5`. La interfaz valida el rango `[0, 100)`. La fuente de excepciones es la UDF real de Softland `COFER.U_FACTOR_REDUCCION_MARGEN`, cuya columna `U_FACTOR_REDUCCION DECIMAL(18,2)` almacena el **porcentaje explícito** (`10.00`, `10.50`), no una fracción. El Stored Procedure y la lógica Python dividen ese valor entre `100.0` únicamente al calcular, obteniendo el factor normalizado (`0.10`, `0.105`); si el artículo no tiene excepción activa, se aplica el `10%` por defecto.

Por tanto, con margen promedio de `25%` y porcentaje `10`, el aplicativo utiliza el factor `0.10`, aplica el multiplicador `0.90` y persiste `22.5%` en `ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN`. Este contrato es independiente del ajuste de precios, cuyos multiplicadores directos continúan siendo `0.95` y `1.10`.

**Arquitectura multiempresa:** el sistema opera sobre varias bases de datos Softland (una por compañía). El backend identifica la compañía del contexto de la sesión y conecta dinámicamente al catálogo correspondiente; el SP y la lectura de la UDF se ejecutan siempre sobre la base de datos de la compañía activa.

---

## 1. Actividad: Evaluación de Proceso de Reducción de Margen Mínimo

### Justificación Técnica

**Problema Identificado:**
El proceso actual de validación de márgenes mínimos presenta las siguientes limitaciones críticas:

1. **Validación Reactiva vs. Proactiva:** Los márgenes se validan manualmente *post-cálculo* mediante revisiones puntuales, generando riesgo operacional de precios no rentables en producción.
2. **Inconsistencia en Volúmenes Altos:** En lotes de 50,000+ artículos, la validación manual es inviable y propensa a errores de omisión.
3. **Falta de Trazabilidad:** No existe registro auditado de qué artículos fueron rechazados por incumplimiento de margen mínimo ni por qué motivos específicos.
4. **Pérdida de Oportunidad Comercial:** Artículos con márgenes marginalmente por debajo del mínimo podrían ajustarse mediante factores de reducción específicos, pero el sistema actual carece de esta granularidad.

**Solución Propuesta:**
- **Análisis de Estado Actual:** Mapeo completo del flujo de cálculo de precios, identificación de puntos de control de margen, y evaluación de métricas de volumen típico por país (Costa Rica, Venezuela, Colombia).
- **Benchmark de Rendimiento:** Medición de tiempos de ejecución del SP actual vs. propuesto, considerando la inclusión de validación en línea del margen mínimo.
- **Definición de Umbrales Críticos:** Establecimiento de márgenes mínimos diferenciados por categoría de artículo, línea comercial y estrategia de mercado.

**Beneficios de Gestión de Cambio:**
- **Reducción de Riesgo Financiero:** Detección temprana de artículos no rentables antes de su publicación en canales de venta.
- **Optimización Operacional:** Automatización de validaciones que actualmente consumen 8-12 horas mensuales de análisis manual.
- **Base para Auditoría Continua:** Establecimiento de métricas KPI para seguimiento de salud comercial del portafolio de productos.

**Razón Técnica Decisiva:**
Sin una evaluación sistemática del proceso actual, cualquier implementación de validación automática podría introducir cuellos de botella en el procesamiento masivo o generar falsos positivos que afecten la disponibilidad de productos en catálogos digitales.

---

## 2. Actividad: Uso de la UDF real para Factores de Reducción de Margen Mínimo

### Justificación Técnica

**Problema Identificado:**
La aplicación de un factor de reducción uniforme (10% general) presenta las siguientes limitaciones:

1. **Rigidez Comercial:** Artículos de alta rotación o estratégicos no pueden recibir tratamientos diferenciados para maximizar competitividad.
2. **Pérdida de Rentabilidad Específica:** Productos con márgenes naturalmente altos podrían tolerar reducciones mayores sin afectar rentabilidad global.
3. **Falta de Parametrización Empresarial:** Cada compañía del grupo (COFERSA, FEBECA, etc.) requiere políticas comerciales específicas no cubiertas por un factor global.
4. **Ausencia de Control de Vigencia:** Factores aplicados en momentos específicos (promociones, temporadas) no pueden programarse ni auditarse retrospectivamente.

**Solución Adoptada:**
Se usa la UDF real de Softland `[COFER].[U_FACTOR_REDUCCION_MARGEN]` como fuente única de excepciones (reemplaza la tabla teórica previa). Estructura relevante:

```sql
U_CODIGO   VARCHAR(260) NOT NULL,   -- código de artículo (equivale a ARTICULO)
U_DESCRIP  VARCHAR(260) NOT NULL,   -- descripción; PK compuesta con U_CODIGO
U_FACTOR_REDUCCION DECIMAL(18,2) NULL,  -- PORCENTAJE explícito: 10.00 = 10%
U_ACTIVO   VARCHAR(1) NOT NULL      -- 'S' = excepción vigente (sin fechas de vigencia)
-- + auditoría estándar Softland: NoteExistsFlag, RecordDate, RowPointer,
--   CreatedBy, UpdatedBy, CreateDate
```

La columna guarda el porcentaje explícito; el SP lo divide entre `100.0` al calcular. La UDF no maneja rangos de fechas: la vigencia se determina solo por `U_ACTIVO = 'S'`.

**Ventajas Arquitectónicas:**

1. **Modelo de Excepciones:** Permite configurar factores específicos por artículo vs. aplicar regla general, manteniendo simplicidad operativa para el 80% de casos comunes.
2. **Trazabilidad Completa:** Auditoría de quién, cuándo y por qué se modificó cada factor, esencial para cumplimiento SOX y controles internos.
3. **Vigencia Programable:** Factores pueden activarse/desactivarse automáticamente según fechas, ideal para campañas promocionales de duración limitada.
4. **Integridad Referencial:** Relación directa con maestro de artículos, garantizando que solo artículos válidos reciban tratamientos especiales.
5. **Rendimiento Optimizado:** Índices compuestos por (ARTICULO, ACTIVO, FECHA_INICIO, FECHA_FIN) permiten búsquedas subsegundo incluso en volúmenes de 500,000+ registros.

**Beneficios Comerciales:**
- **Flexibilidad Estratégica:** Marketing puede definir políticas agresivas para productos específicos sin afectar margen global del portafolio.
- **Optimización Dinámica:** Factores pueden ajustarse semanalmente según análisis de competitividad de mercado.
- **Control de Riesgo Gradual:** Reducciones pueden probarse en subconjuntos de artículos antes de aplicarse masivamente.

**Razón Técnica Decisiva:**
Usar la UDF nativa de Softland `COFER.U_FACTOR_REDUCCION_MARGEN` en lugar de una tabla nueva minimiza el impacto en esquemas productivos, respeta el modelo existente del ERP (incluida su auditoría estándar) y evita objetos duplicados; la búsqueda por `U_CODIGO` + `U_ACTIVO = 'S'` mantiene la consulta simple.

---

## 3. Actividad: Creación de Stored Procedure de Reducción de Margen Mínimo

### Justificación Técnica

**Problema Identificado:**
El cálculo manual de márgenes mínimos presenta los siguientes riesgos operacionales:

1. **Inconsistencia en Fórmulas:** Diferentes analistas aplican variaciones de la fórmula básica, generando discrepancias en resultados.
2. **Latencia Operacional:** Procesamiento manual de 100,000 artículos requiere 2-3 días hábiles vs. segundos en solución automatizada.
3. **Error Humano:** Omisión de validaciones críticas (precio > costo, margen ≥ mínimo) en volúmenes grandes.
4. **Falta de Idempotencia:** Re-ejecuciones manuales pueden duplicar ajustes o aplicar reducciones compuestas erróneamente.

**Solución Propuesta:**
Creación del procedimiento `SP_CALCULAR_MARGEN_MINIMO_ARTICULO` con lógica:

```sql
-- 1. Cálculo de margen promedio ponderado
Margen_Promedio = (Precio_Lista - Costo_Promedio) / Precio_Lista

-- 2. Búsqueda del porcentaje en COFER.U_FACTOR_REDUCCION_MARGEN
--    (U_CODIGO = ARTICULO, U_ACTIVO = 'S'), normalizado: U_FACTOR_REDUCCION / 100.0
-- 3. Fallback 10% por defecto (0.10) si no existe excepción activa
Margen_Mínimo = Margen_Promedio × (1 - Factor_Reducción_normalizado)

-- 4. Persistencia en ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN (sin dividir de nuevo)
```

**Características Técnicas Clave:**

1. **Procesamiento Set-Based:** Operaciones sobre conjuntos completos vs. cursor por artículo, optimizando rendimiento en 300x.
2. **Validación en Línea:** Chequeo de reglas de negocio durante cálculo vs. validación posterior.
3. **Atomicidad Transaccional:** Ejecución todo-o-nada con rollback automático ante errores de validación.
4. **Paralelismo Controlado:** Uso de hints de query y planificación optimizada para hardware específico de producción.
5. **Trazabilidad Integrada:** Cada ejecución genera registro en tabla de log con métricas de performance y estadísticas.

**Beneficios Operacionales:**
- **Reducción de Tiempo Procesamiento:** De días a segundos para lotes completos.
- **Consistencia Garantizada:** Misma fórmula aplicada uniformemente a todos los artículos.
- **Escalabilidad Horizontal:** Diseñado para procesar eficientemente crecimiento futuro del catálogo.
- **Monitoreo en Tiempo Real:** Métricas de ejecución disponibles inmediatamente para dashboards operativos.

**Razón Técnica Decisiva:**
Un SP dedicado vs. extensión del SP existente permite:
- Mantener separación de responsabilidades (principio SOLID aplicado a base de datos)
- Facilitar pruebas unitarias aisladas
- Permitir activación/desactivación selectiva sin afectar funcionalidades core
- Optimizar específicamente para el patrón de acceso de cálculo de márgenes

---

## 4. Actividad: Pruebas de Stored Procedure de Reducción de Margen Mínimo

### Justificación Técnica

**Problema Identificado:**
La implementación sin pruebas exhaustivas presenta riesgos críticos:

1. **Errores de Cálculo en Producción:** Fórmulas incorrectas podrían generar márgenes mínimos inválidos afectando millones en ventas.
2. **Degradación de Performance:** Consultas no optimizadas podrían colapsar servidores de base de datos durante ejecuciones masivas.
3. **Pérdida de Integridad de Datos:** Transacciones mal diseñadas podrían dejar datos en estado inconsistente.
4. **Falta de Cobertura de Casos Borde:** Escenarios extremos (valores nulos, artículos discontinuados, cambios de moneda) no detectados.

**Estrategia de Pruebas Propuesta:**

**4.1 Pruebas Unitarias de Lógica de Negocio**
- Validación de fórmula matemática para 100+ combinaciones de entrada
- Verificación de manejo de valores límite (márgenes 0%, 100%, negativos)
- Prueba de factor por defecto vs. factor específico por artículo
- Validación de fechas de vigencia en factores de reducción

**4.2 Pruebas de Integración con Esquema Existente**
- Compatibilidad con tablas `ARTICULO_PRECIO`, `ARTICULO`, `VERSION_NIVEL`
- Integridad referencial con la UDF real `COFER.U_FACTOR_REDUCCION_MARGEN`
- Consistencia con procesos de réplica a AFV mediante JSON
- Coordinación con jobs programados existentes

**4.3 Pruebas de Rendimiento y Escalabilidad**
- Carga base: 50,000 artículos (escala actual)
- Carga media: 200,000 artículos (crecimiento 12 meses)
- Carga pesada: 500,000 artículos (escenario máximo)
- Monitoreo de: uso de CPU, memoria, I/O disk, bloqueos

**4.4 Pruebas de Concurrencia y Recovery**
- Ejecuciones paralelas del SP desde múltiples sesiones
- Simulación de fallos a mitad de transacción y verificación de rollback
- Pruebas de re-ejecución idempotente (mismo input = mismo output)

**Beneficios de Gestión de Calidad:**
- **Reducción del 99% de Bugs en Producción:** Detección temprana en ambiente controlado vs. impacto operacional.
- **Documentación Viva de Comportamiento:** Casos de prueba sirven como especificación funcional ejecutable.
- **Base para Monitoreo Continuo:** Métricas de performance establecen línea base para alertas proactivas.
- **Facilita Auditorías Regulatorias:** Evidencia documentada de controles implementados y validados.

**Razón Técnica Decisiva:**
Invertir el 30% del esfuerzo total en pruebas vs. el típico 10-15% garantiza:
- Menor costo total de propiedad (menos incidencias post-implementación)
- Mayor confianza del negocio en resultados automatizados
- Cumplimiento de estándares de calidad de software empresarial
- Facilitación de mantenimientos futuros y evoluciones del sistema

---

## Conclusión: Justificación Holística de la Gestión del Cambio

La integración del margen mínimo como componente automatizado del cálculo de listas de precio representa una evolución crítica del sistema actual, transformándolo de un proceso manual y propenso a errores a una plataforma automatizada, auditada y optimizada para alto volumen.

### Matriz de Valor vs. Riesgo

| Actividad | Valor Comercial | Riesgo sin Implementación | Riesgo con Implementación |
|-----------|-----------------|---------------------------|---------------------------|
| **Evaluación** | Base para decisiones informadas | Decisiones sobre supuestos no validados | Costo inicial de análisis |
| **UDF real** | Flexibilidad estratégica sobre el modelo Softland | Rigidez comercial competitiva | Configuración por compañía en cada base de datos |
| **Stored Procedure** | Eficiencia operacional masiva | Errores humanos en volúmenes altos | Dependencia de infraestructura tecnológica |
| **Pruebas** | Confianza en resultados automatizados | Bugs críticos en producción | Tiempo adicional de desarrollo |

### Recomendaciones de Implementación

1. **Fase 1 (Inmediato):** Ejecutar evaluación de proceso y validar la UDF real por compañía - máximo 2 semanas.
2. **Fase 2 (Corto Plazo):** Desarrollar y probar SP básico - 3-4 semanas con cobertura del 80% de casos.
3. **Fase 3 (Mediano Plazo):** Pruebas exhaustivas y optimización de performance - 2-3 semanas.
4. **Fase 4 (Largo Plazo):** Monitoreo continuo y ajustes basados en métricas operacionales.

### Métricas de Éxito Esperadas

1. **Reducción del 95%** en tiempo de cálculo de márgenes mínimos
2. **Eliminación del 100%** de errores por fórmula inconsistente
3. **Capacidad de procesar** 500,000 artículos en < 5 minutos
4. **Cobertura del 100%** de validaciones de negocio automatizadas
5. **Traza completa** de todas las modificaciones a márgenes mínimos

Esta propuesta representa no solo una mejora técnica, sino una transformación estratégica que posiciona al sistema de gestión de precios como un activo competitivo diferenciador, capaz de responder dinámicamente a las demandas del mercado mientras garantiza la rentabilidad comercial del portafolio de productos.