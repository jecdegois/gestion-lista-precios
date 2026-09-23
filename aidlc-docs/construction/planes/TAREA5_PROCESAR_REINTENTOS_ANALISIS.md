# TAREA 5: Procesar Reintentos - Análisis de Requisitos y Diseño

**Proyecto:** MV26020 - Gestión de Listas de Precio  
**Fase:** CONSTRUCTION - PASO 2  
**Tarea:** 5 de 8  
**Fecha:** 2026-09-18  
**Estimado:** 4 horas  
**Prioridad:** CRÍTICA  

---

## 1. Requisitos Asociados

### RF-29: Reintentos Automáticos ante Errores Transitorios
```
Ante errores transitorios definidos — por ejemplo, bloqueo temporal, 
interrupción breve de conectividad, saturación temporal o indisponibilidad 
momentánea de infraestructura — el backend debe reintentar hasta tres veces.
```

**Errores Transitorios Permitidos:**
- `TIMEOUT`: Timeout en base de datos o API externa
- `DEADLOCK`: Deadlock de SQL Server (puede reintentarse)
- `CONNECTION_LOST`: Pérdida de conectividad (transitoria)
- `RESOURCE_UNAVAILABLE`: Recurso temporalmente no disponible
- `SERVICE_BUSY`: Servicio saturado (429, 503)

**Errores NO Transitorios (No reintentar):**
- `VALIDATION_ERROR`: Validación de datos fallida
- `AUTHORIZATION_ERROR`: Autorización insuficiente
- `NOT_FOUND`: Recurso no existe
- `BUSINESS_RULE_ERROR`: Violación de regla de negocio
- `CONFIG_ERROR`: Error de configuración

### RF-30: Límite de Reintentos y Estado Final
```
Después del tercer intento fallido, la solicitud debe pasar a 
Error de ejecución y conservar la evidencia técnica permitida.
```

**Lógica de Reintentos:**
- Máximo 3 intentos por solicitud
- Si éxito en cualquier intento: marcar como `EXITOSO`
- Si 3 fallos consecutivos: marcar como `FALLIDO_PERMANENTE`
- Registrar evidencia técnica (tipo error, timestamp, intento #)

### RNF-06: Resiliencia ante Errores Transitorios
```
El control de ámbito por compañía y rol debe aplicarse tanto en la 
interfaz como en el backend. Las listas y categorías de las solicitudes 
deben validarse contra Softland y las reglas funcionales.
```

**Aplicabilidad:** La auditoría de reintentos debe registrarse con:
- USUARIO_EMAIL: 'SISTEMA' (proceso automático)
- USUARIO_NOMBRE: 'BACKGROUND_JOB_REINTENTOS'
- ACCION: 'REINTENTO_AUTOMATICO'
- COMENTARIO_DECISION: Razón del reintento (ej. "Intento 2/3 - Deadlock detectado")

---

## 2. Análisis de Tabla SOLICITUD_REINTENTO

### Estructura Existente
```sql
-- Columnas clave para esta tarea:
ID_REINTENTO BIGINT (PK)
ID_SOLICITUD INT (FK → SOLICITUD)
INTENTO_NUMERO INT (1-3)
TIPO_ERROR VARCHAR(40) (TIMEOUT, DEADLOCK, CONNECTION_LOST, etc.)
FECHA_INTENTO DATETIME
PROXIMO_REINTENTO_PROGRAMADO DATETIME
RESULTADO_REINTENTO VARCHAR(20) (NULL, 'EXITOSO', 'FALLIDO')
MENSAJE_ERROR_TECNICO VARCHAR(1000)
FECHA_FIN_EJECUCION DATETIME
```

### Constraints Existentes
```sql
CK_REINTENTO_INTENTO: INTENTO_NUMERO BETWEEN 1 AND 3
CK_REINTENTO_TIPO_ERROR: TIPO_ERROR IN (...)
CK_REINTENTO_RESULTADO: RESULTADO_REINTENTO IN (NULL, 'EXITOSO', 'FALLIDO')
```

### Índices Existentes
```sql
IX_SOL_REINTENTO_SOLICITUD (ID_SOLICITUD)
IX_SOL_REINTENTO_PROXIMO (PROXIMO_REINTENTO_PROGRAMADO)
IX_SOL_REINTENTO_ESTADO (ID_SOLICITUD, RESULTADO_REINTENTO)
```

---

## 3. Lógica de Backoff Exponencial

### Estrategia de Espera entre Reintentos
```
Intento 1 (Fallido) → Próximo en 5 minutos
Intento 2 (Fallido) → Próximo en 15 minutos  (5 * 3)
Intento 3 (Fallido) → Próximo en 60 minutos  (15 * 4)
```

**Fórmula:**
```
PROXIMO_REINTENTO_PROGRAMADO = GETDATE() + INTERVAL_EN_MINUTOS / 1440.0 días

-- Para 5 minutos:   GETDATE() + (5 / 1440)
-- Para 15 minutos:  GETDATE() + (15 / 1440)
-- Para 60 minutos:  GETDATE() + (60 / 1440)
```

**Parámetro de Control:**
- `@P_MAX_REINTENTOS INT = 3` (máximo 3 reintentos)
- `@P_TIMEOUT_SEGUNDOS INT = 300` (espera máxima de reintento)

---

## 4. Contrato de Stored Procedure

### Nombre
```
sp_procesar_reintentos
```

### Parámetros de Entrada
```sql
@P_MAX_REINTENTOS INT = 3
@P_TIMEOUT_SEGUNDOS INT = 300
```

### Parámetros de Salida
```sql
@P_REINTENTOS_PROCESADOS INT OUTPUT       -- Total procesados en esta ejecución
@P_EXITOSOS INT OUTPUT                    -- Cantidad exitosas
@P_PENDIENTES INT OUTPUT                  -- Cantidad aún pendientes (próx. intento)
@P_FALLIDOS INT OUTPUT                    -- Cantidad fallidos permanentes
```

### Lógica Principal

**Paso 1: Buscar Reintentos Pendientes**
```sql
SELECT * FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO
WHERE 
  PROXIMO_REINTENTO_PROGRAMADO <= GETDATE()
  AND RESULTADO_REINTENTO IS NULL
  AND INTENTO_NUMERO < @P_MAX_REINTENTOS
ORDER BY PROXIMO_REINTENTO_PROGRAMADO ASC
LIMIT 1000;  -- Procesar máximo 1000 por ejecución
```

**Paso 2: Para Cada Reintento**
- Leer `ID_SOLICITUD`, `TIPO_ERROR`, `INTENTO_NUMERO`
- Simular/Ejecutar lógica de reintento (en PASO 3 será real)
- Registrar resultado

**Paso 3: Determinar Próximo Estado**

```
IF Éxito:
  - RESULTADO_REINTENTO = 'EXITOSO'
  - FECHA_FIN_EJECUCION = GETDATE()
  - Actualizar SOLICITUD.ESTADO = 'PROCESADO'
  - Insertar auditoría: ACCION='REINTENTO_EXITOSO'
  
ELSE IF Error Transitorio:
  - IF INTENTO_NUMERO < 3:
      - INTENTO_NUMERO++
      - PROXIMO_REINTENTO_PROGRAMADO = GETDATE() + (backoff_minutos / 1440)
      - RESULTADO_REINTENTO = NULL (sigue pendiente)
      - Insertar auditoría: ACCION='REINTENTO_PROGRAMADO'
    
    ELSE (INTENTO_NUMERO = 3):
      - RESULTADO_REINTENTO = 'FALLIDO'
      - FECHA_FIN_EJECUCION = GETDATE()
      - Actualizar SOLICITUD.ESTADO = 'ERROR_EJECUCION'
      - Insertar auditoría: ACCION='REINTENTO_AGOTADO'

ELSE (Error No Transitorio):
  - RESULTADO_REINTENTO = 'FALLIDO'
  - FECHA_FIN_EJECUCION = GETDATE()
  - Actualizar SOLICITUD.ESTADO = 'PROCESADO_CON_ERRORES'
  - NO reintentar
  - Insertar auditoría: ACCION='REINTENTO_NO_VALIDO'
```

---

## 5. Flujo de Control del Stored Procedure

```
START
  │
  ├─→ Validar parámetros de entrada
  │
  ├─→ Buscar reintentos pendientes (PROXIMO_REINTENTO_PROGRAMADO <= AHORA)
  │
  ├─→ FOR EACH reintento pendiente:
  │     │
  │     ├─→ Obtener datos de SOLICITUD
  │     │
  │     ├─→ TRY:
  │     │     Ejecutar lógica de reintento (simular en PASO 2)
  │     │     IF Éxito:
  │     │       UPDATE RESULTADO_REINTENTO = 'EXITOSO'
  │     │       UPDATE SOLICITUD.ESTADO = 'PROCESADO'
  │     │       Insertar auditoría REINTENTO_EXITOSO
  │     │       @P_EXITOSOS++
  │     │
  │     ├─→ CATCH Error:
  │     │     Detectar tipo de error (TIPO_ERROR)
  │     │     IF ES_ERROR_TRANSITORIO:
  │     │       IF INTENTO_NUMERO < 3:
  │     │         INTENTO_NUMERO++
  │     │         Calcular próximo backoff
  │     │         UPDATE PROXIMO_REINTENTO_PROGRAMADO
  │     │         @P_PENDIENTES++
  │     │         Insertar auditoría REINTENTO_PROGRAMADO
  │     │       ELSE:
  │     │         RESULTADO_REINTENTO = 'FALLIDO'
  │     │         SOLICITUD.ESTADO = 'ERROR_EJECUCION'
  │     │         @P_FALLIDOS++
  │     │         Insertar auditoría REINTENTO_AGOTADO
  │     │
  │     │     ELSE:
  │     │       RESULTADO_REINTENTO = 'FALLIDO'
  │     │       NO reintentar
  │     │       @P_FALLIDOS++
  │     │       Insertar auditoría REINTENTO_NO_VALIDO
  │
  ├─→ Contar totales: @P_REINTENTOS_PROCESADOS = @P_EXITOSOS + @P_PENDIENTES + @P_FALLIDOS
  │
  └─→ RETURN (exitoso)
```

---

## 6. Pseudo-código de la Función de Reintento

### En PASO 2 (Simulación)
```sql
-- Simular ejecución con patrón de error aleatorio
-- En PASO 3 será reemplazado con lógica real

DECLARE @v_resultado_simulado VARCHAR(20);
DECLARE @v_tipo_error_simulado VARCHAR(40);

-- Simular diferentes tipos de errores para testing
SET @v_resultado_simulado = CHOOSE(
  RAND() * 10,
  'EXITOSO',          -- 30% de probabilidad
  'EXITOSO',          
  'EXITOSO',
  'TIMEOUT',          -- 20%
  'TIMEOUT',
  'DEADLOCK',         -- 20%
  'DEADLOCK',
  'CONNECTION_LOST',  -- 15%
  'CONNECTION_LOST',
  'VALIDATION_ERROR'  -- 15%
);

IF @v_resultado_simulado = 'EXITOSO'
  RETURN 'EXITOSO'
ELSE
  RETURN @v_resultado_simulado;
```

---

## 7. Casos de Prueba (Testing)

### TEST 1: Reintento Exitoso en Intento 1
```
SETUP:
  - Crear SOLICITUD_REINTENTO con INTENTO_NUMERO=1, TIPO_ERROR='TIMEOUT'
  - PROXIMO_REINTENTO_PROGRAMADO = GETDATE() - 1 minuto (pasado)
  - RESULTADO_REINTENTO = NULL
  
EXEC sp_procesar_reintentos
  
EXPECTED:
  - @P_REINTENTOS_PROCESADOS = 1
  - @P_EXITOSOS = 1
  - @P_PENDIENTES = 0
  - @P_FALLIDOS = 0
  - RESULTADO_REINTENTO = 'EXITOSO'
  - SOLICITUD.ESTADO = 'PROCESADO'
  - 1 registro en AUDITORIA_APROBACION (REINTENTO_EXITOSO)
```

### TEST 2: Reintento Falla, Programa Siguiente
```
SETUP:
  - INTENTO_NUMERO=1, TIPO_ERROR='DEADLOCK'
  - PROXIMO_REINTENTO_PROGRAMADO = GETDATE() - 1 minuto
  - RESULTADO_REINTENTO = NULL
  - Simular error transitorio (DEADLOCK)
  
EXEC sp_procesar_reintentos
  
EXPECTED:
  - @P_REINTENTOS_PROCESADOS = 1
  - @P_EXITOSOS = 0
  - @P_PENDIENTES = 1
  - @P_FALLIDOS = 0
  - INTENTO_NUMERO = 2
  - PROXIMO_REINTENTO_PROGRAMADO ≈ GETDATE() + 15 minutos
  - RESULTADO_REINTENTO = NULL (sigue pendiente)
  - 1 registro en AUDITORIA_APROBACION (REINTENTO_PROGRAMADO)
```

### TEST 3: Agota 3 Reintentos, Marca Permanente
```
SETUP:
  - INTENTO_NUMERO=3, TIPO_ERROR='CONNECTION_LOST'
  - PROXIMO_REINTENTO_PROGRAMADO = GETDATE() - 1 minuto
  - RESULTADO_REINTENTO = NULL
  - Simular error transitorio
  
EXEC sp_procesar_reintentos
  
EXPECTED:
  - @P_REINTENTOS_PROCESADOS = 1
  - @P_EXITOSOS = 0
  - @P_PENDIENTES = 0
  - @P_FALLIDOS = 1
  - RESULTADO_REINTENTO = 'FALLIDO'
  - FECHA_FIN_EJECUCION = GETDATE()
  - SOLICITUD.ESTADO = 'ERROR_EJECUCION'
  - 1 registro en AUDITORIA_APROBACION (REINTENTO_AGOTADO)
```

### TEST 4: Error No Transitorio, No Reintentar
```
SETUP:
  - INTENTO_NUMERO=1, TIPO_ERROR='VALIDATION_ERROR'
  - PROXIMO_REINTENTO_PROGRAMADO = GETDATE() - 1 minuto
  - RESULTADO_REINTENTO = NULL
  - Simular error no transitorio
  
EXEC sp_procesar_reintentos
  
EXPECTED:
  - @P_REINTENTOS_PROCESADOS = 1
  - @P_EXITOSOS = 0
  - @P_PENDIENTES = 0
  - @P_FALLIDOS = 1
  - RESULTADO_REINTENTO = 'FALLIDO'
  - INTENTO_NUMERO = 1 (sin incremento)
  - SOLICITUD.ESTADO = 'PROCESADO_CON_ERRORES'
  - 1 registro en AUDITORIA_APROBACION (REINTENTO_NO_VALIDO)
```

### TEST 5: Procesar Múltiples Reintentos (Batch)
```
SETUP:
  - Crear 10 registros SOLICITUD_REINTENTO con diferentes estados
  - 3 listos para reintento (PROXIMO_REINTENTO_PROGRAMADO pasado)
  - 2 no listos aún (PROXIMO_REINTENTO_PROGRAMADO futuro)
  - 5 ya procesados (RESULTADO_REINTENTO != NULL)
  
EXEC sp_procesar_reintentos
  
EXPECTED:
  - @P_REINTENTOS_PROCESADOS = 3 (solo los listos)
  - @P_EXITOSOS + @P_PENDIENTES + @P_FALLIDOS = 3
  - Los no listos y ya procesados permanecen sin cambios
```

---

## 8. Auditoría de Reintentos

### Registros en AUDITORIA_APROBACION

| ACCION | CUANDO | COMENTARIO_DECISION |
|--------|--------|---------------------|
| `REINTENTO_AUTOMATICO` | Se inicia reintento | "Intento 1/3 - Error: DEADLOCK" |
| `REINTENTO_PROGRAMADO` | Falla transitoria, programa siguiente | "Intento 2 programado en 15 minutos" |
| `REINTENTO_EXITOSO` | Éxito en reintento | "Éxito en intento 2/3" |
| `REINTENTO_AGOTADO` | Agota 3 intentos | "3 intentos agotados - Última falla: TIMEOUT" |
| `REINTENTO_NO_VALIDO` | Error no transitorio | "Error no retryeable: VALIDATION_ERROR" |

---

## 9. Consideraciones de Implementación

### Performance
- Procesar máximo 1000 reintentos por ejecución
- Usar índice `IX_SOL_REINTENTO_PROXIMO` para búsqueda eficiente
- Incluir timeout en la ejecución de reintento (@P_TIMEOUT_SEGUNDOS)

### Logging y Observabilidad
- Todos los cambios registrados en AUDITORIA_APROBACION
- Mensajes de error técnico almacenados en MENSAJE_ERROR_TECNICO
- Correlación mediante ID_SOLICITUD

### Idempotencia
- Si la ejecución se interrumpe, reintentos pendientes quedan en estado recoverable
- Próxima ejecución retoma automáticamente
- No hay duplicación de resultados

### Seguridad
- Usuario SISTEMA para auditoría automática
- No exponer mensajes de error técnico a interfaz
- Logs solo para administradores

---

## 10. Plan de Implementación (Step-by-Step)

### [ ] 1. Crear SP_PROCESAR_REINTENTOS (estructura básica)
### [ ] 2. Implementar lógica de búsqueda de reintentos pendientes
### [ ] 3. Implementar lógica de simulación de ejecución
### [ ] 4. Implementar lógica de detección de tipo de error
### [ ] 5. Implementar lógica de backoff exponencial
### [ ] 6. Implementar auditoría de reintentos
### [ ] 7. Crear TEST 1: Reintento exitoso
### [ ] 8. Crear TEST 2: Falla transitoria, programa siguiente
### [ ] 9. Crear TEST 3: Agota reintentos
### [ ] 10. Crear TEST 4: Error no retryeable
### [ ] 11. Crear TEST 5: Batch de reintentos
### [ ] 12. Validar todos los tests pasan
### [ ] 13. Documentar resultados de testing

---

## 11. Próximos Pasos

1. **Aprobación de Diseño**: ¿Aceptas este análisis y diseño?
2. **Generación de Código**: Crear SP_PROCESAR_REINTENTOS basado en este plan
3. **Testing**: Ejecutar los 5 casos de prueba
4. **Validación**: Verificar cobertura de requisitos (RF-29, RF-30, RNF-06)

---

**Estado:** ⏳ Pendiente aprobación de diseño  
**Próximo Paso:** Generar código del Stored Procedure

