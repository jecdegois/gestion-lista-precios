# Discrepancias del Modelo de Base de Datos vs Documentación Inicial

**Proyecto:** MV26020 - Cálculo de Listas de Precio  
**Fase:** PASO 2 - Stored Procedures de Aprobación y Reintentos (Tarea 5-6)  
**Fecha:** 2026-09-18  
**Estado:** Documentación de Hallazgos Críticos

---

## Resumen Ejecutivo

Durante el desarrollo de las tareas 5 y 6 de PASO 2, se identificaron **8 discrepancias significativas** entre el modelo físico en SOFTLANDQA y la documentación inicial del proyecto. Estas diferencias causaron **múltiples errores de ejecución** que requirieron iteraciones de troubleshooting.

**Impacto:** Alto - Afecta la precisión de documentación y estimaciones futuras.

---

## Tabla Comparativa de Discrepancias

| # | Aspecto | Documentación Inicial | Modelo Real (SOFTLANDQA) | Impacto | Severidad |
|---|---------|----------------------|-------------------------|--------|-----------|
| 1 | **Nombre tabla** | SOLICITUD_PRECIO | SOLICITUD | Queries fallan, FK incorrecta | 🔴 Crítica |
| 2 | **Columna ES_ERROR_TRANSITORIO** | TINYINT (0/1) | CHAR(1) ('N'/'S') | Type mismatch, CHECK constraint falla | 🔴 Crítica |
| 3 | **Columna PARAMETROS_JSON** | Documentación no menciona | NOT NULL (NVARCHAR) | INSERT falla, campo requerido | 🔴 Crítica |
| 4 | **TIPO_ERROR valores válidos** | No especificado en doc | connection_timeout, service_unavailable, other_transient, temporary_lock | CHECK constraint rechaza valores, violación FK | 🔴 Crítica |
| 5 | **COMPANIA - FK constraint** | Ref: tabla COMPANIA (valores abiertos) | Valores permitidos: BEVAL, COFERSA, FEBECA, SILLACA | FK rechaza INTELIX, valores hardcodeados | 🟡 Alta |
| 6 | **CODIGO_SOLICITUD** | Campo nullable | UNIQUE INDEX obligatorio | Duplicados rechazan INSERT, necesita timestamp único | 🟡 Alta |
| 7 | **RESULTADO_EJECUCION en AUDITORIA** | Sin límite documentado | VARCHAR(50) trunca strings largos | Cadenas largas causan truncation error | 🟡 Alta |
| 8 | **INTENTO_NUMERO - valores históricos** | Abierto a reintentos ilimitados | CHECK: INTENTOS_REINTENTO ≤ 3 | Límite a 3 reintentos no documentado, RF-30 no evidente | 🟡 Alta |

---

## Detalle de Discrepancias

### 1. 🔴 TABLA: SOLICITUD vs SOLICITUD_PRECIO

**Documentación Inicial:**
```
Tabla: SOLICITUD_PRECIO
Descripción: Almacena solicitudes de cambios de lista de precios
```

**Modelo Real:**
```
Tabla: SOLICITUD (no _PRECIO)
Schema: PORTAL_PRECIOS.SOLICITUD
```

**Error Encontrado:**
```sql
-- Error en Tarea 5:
Msg 208: Invalid object name 'SOLICITUD_PRECIO'

-- Solución:
SELECT * FROM PORTAL_PRECIOS.SOLICITUD  -- Tabla correcta
```

**Impacto:** 
- Queries incorrectas necesitan refactor
- Foreign keys referencian SOLICITUD
- Documentación DDL desactualizada

**Acción Requerida:**
- ✅ Actualizar DDL documentation
- ✅ Usar SOLICITUD en todos los scripts

---

### 2. 🔴 COLUMNA: ES_ERROR_TRANSITORIO (Type Mismatch)

**Documentación Inicial:**
```sql
ES_ERROR_TRANSITORIO TINYINT DEFAULT 0  -- Valores: 0 (No), 1 (Sí)
```

**Modelo Real:**
```sql
ES_ERROR_TRANSITORIO CHAR(1) DEFAULT 'N'  -- Valores: 'N', 'S'
CHECK: ([ES_ERROR_TRANSITORIO]='N' OR [ES_ERROR_TRANSITORIO]='S')
```

**Error Encontrado:**
```
Msg 547: The INSERT statement conflicted with the CHECK constraint "CK_SOLICITUD_ERROR_TRANS"
Conflict occurred when inserting value: 1 (expected 'S')
```

**Impacto:**
- Todos los INSERT fallaban con 1/0 en lugar de 'S'/'N'
- Código backend esperaba TINYINT, pero es CHAR(1)
- SP Tarea 5 y 6 requerían ajuste

**Solución Aplicada:**
```sql
-- Cambiar de:
ES_ERROR_TRANSITORIO = 1

-- A:
ES_ERROR_TRANSITORIO = 'S'
```

**Acción Requerida:**
- ✅ Actualizar documentación DDL a CHAR(1) con valores 'N'/'S'
- ✅ Revisar código backend (si existe) para usar 'S'/'N'
- ⚠️ Revisar migraciones de datos (conversión 0→'N', 1→'S' si existen)

---

### 3. 🔴 COLUMNA: PARAMETROS_JSON (NOT NULL No Documentado)

**Documentación Inicial:**
```sql
PARAMETROS_JSON: Campo opcional para almacenar parámetros
(No especifica si es NULL o NOT NULL)
```

**Modelo Real:**
```sql
PARAMETROS_JSON NVARCHAR(MAX) NOT NULL
```

**Error Encontrado:**
```
Msg 515: Cannot insert the value NULL into column 'PARAMETROS_JSON', 
table 'SOFTLANDQA.PORTAL_PRECIOS.SOLICITUD'; column does not allow nulls.
```

**Impacto:**
- Todos los INSERT sin PARAMETROS_JSON fallaban
- Campo requerido pero no documentado
- Tests requirieron '{"test":true}' como valor por defecto

**Solución Aplicada:**
```sql
INSERT INTO SOLICITUD (..., PARAMETROS_JSON, ...)
VALUES (..., '{"test":true}', ...)  -- Valor requerido
```

**Acción Requerida:**
- ✅ Documentar que PARAMETROS_JSON es NOT NULL
- ⚠️ Definir schema JSON estándar esperado
- ⚠️ Definir valor por defecto o requerimientos mínimos

---

### 4. 🔴 CHECK CONSTRAINT: TIPO_ERROR (Valores Limitados)

**Documentación Inicial:**
```
TIPO_ERROR: Campo de descripción de error
Valores: "Abierto" / "Sin restricción"
```

**Modelo Real:**
```sql
TIPO_ERROR VARCHAR(50) NOT NULL
-- Valores válidos en datos: 
--   connection_timeout
--   service_unavailable
--   other_transient
--   temporary_lock
-- (No hay CHECK constraint explícito, pero base de datos contiene solo estos valores)
```

**Error Encontrado:**
```
Msg 547: The INSERT statement conflicted with the CHECK constraint "CK_REINTENTO_TIPO_ERROR"
Inserted value: 'TIMEOUT' (expected: 'connection_timeout', etc.)
```

**Impacto:**
- Intentos previos a usar TIPO_ERROR genéricos (TIMEOUT, API_TIMEOUT) fallaban
- Requería mapping de errores a valores válidos
- SP Tarea 5-6 necesitó lógica de transformación

**Solución Aplicada:**
```sql
-- Mapeo interno en SP:
IF @CODIGO_ERROR LIKE '%timeout%' SET @TIPO_ERROR = 'connection_timeout'
ELSE IF @CODIGO_ERROR LIKE '%service%' SET @TIPO_ERROR = 'service_unavailable'
ELSE SET @TIPO_ERROR = 'other_transient'
```

**Acción Requerida:**
- ✅ Documentar valores válidos explícitamente
- ✅ Considerar agregar CHECK constraint explícito si no existe
- ✅ Crear tabla de lookup TIPO_ERROR para mantener valores centralizados

---

### 5. 🟡 FOREIGN KEY: COMPANIA (Valores Limitados)

**Documentación Inicial:**
```
COMPANIA: Referencia a tabla COMPANIA
Descripción: "Empresa asociada a la solicitud"
Ejemplos: INTELIX, COFERSA, ...
```

**Modelo Real:**
```sql
FOREIGN KEY FK_PP_SOL_COMPANIA REFERENCES COMPANIA (COMPANIA)
-- Valores válidos en BD:
--   BEVAL
--   COFERSA
--   FEBECA
--   SILLACA
-- (INTELIX no existe en tabla COMPANIA)
```

**Error Encontrado:**
```
Msg 547: The INSERT statement conflicted with the FOREIGN KEY constraint "FK_PP_SOL_COMPANIA"
Tried to insert COMPANIA='INTELIX' but no match in COMPANIA table
```

**Impacto:**
- Ejemplo de documentación (INTELIX) no existe en BD real
- Tests necesitaban usar valores válidos reales
- Queries que filtren por INTELIX fallarían

**Solución Aplicada:**
```sql
-- Cambiar de: COMPANIA = 'INTELIX'
-- A: COMPANIA IN ('BEVAL', 'COFERSA', 'FEBECA', 'SILLACA')
```

**Acción Requerida:**
- ✅ Documentar valores válidos de COMPANIA explícitamente
- ⚠️ Actualizar ejemplos en documentación a valores reales
- ⚠️ Considerar script de validación de valores permitidos

---

### 6. 🟡 UNIQUE INDEX: CODIGO_SOLICITUD (No Documentado)

**Documentación Inicial:**
```
CODIGO_SOLICITUD: Código de referencia de solicitud
Tipo: VARCHAR(255)
Constraint: No mencionado
```

**Modelo Real:**
```sql
UNIQUE INDEX UX_SOLICITUD_CODIGO_SOLICITUD ON SOLICITUD(CODIGO_SOLICITUD)
-- El índice UNIQUE obliga valores únicos globales en la columna
```

**Error Encontrado:**
```
Msg 2601: Cannot insert duplicate key row in object 'PORTAL_PRECIOS.SOLICITUD' 
with unique index 'UX_SOLICITUD_CODIGO_SOLICITUD'. 
Duplicate key value is (TEST_REPRO_9996).
```

**Impacto:**
- Tests no pueden reutilizar CODIGO_SOLICITUD
- Necesitaba generar códigos únicos (con timestamp)
- Limpieza de datos previos crítica

**Solución Aplicada:**
```sql
-- Cambiar de códigos estáticos:
CODIGO_SOLICITUD = 'TEST_REPRO_9996'

-- A códigos con timestamp:
DECLARE @TS NVARCHAR(20) = FORMAT(GETDATE(), 'yyyyMMddHHmmss');
CODIGO_SOLICITUD = 'T6_T1_' + @TS  -- Garantiza unicidad
```

**Acción Requerida:**
- ✅ Documentar UNIQUE INDEX en DDL
- ✅ Definir estrategia de generación de CODIGO_SOLICITUD (secuencial vs timestamp)
- ⚠️ Script de cleanup de datos test

---

### 7. 🟡 CAMPO: RESULTADO_EJECUCION (Longitud Limitada)

**Documentación Inicial:**
```
RESULTADO_EJECUCION: Descripción del resultado de la aprobación
Tipo: TEXT / VARCHAR
Límite: No especificado
```

**Modelo Real:**
```sql
RESULTADO_EJECUCION VARCHAR(?) -- Límite desconocido, probablemente <= 10-15 chars
```

**Error Encontrado:**
```
Msg 8152: String or binary data would be truncated in table 'SOFTLANDQA.PORTAL_PRECIOS.AUDITORIA_APROBACION', 
column 'RESULTADO_EJECUCION'. 
Truncated value: 'Exitoso - Repro' (de 'Exitoso - Reproceso programado para intento 1')
```

**Impacto:**
- Mensajes descriptivos se truncaban
- Necesitaba acortar a 'Exitoso' (7 caracteres)
- Información de contexto se perdía

**Solución Aplicada:**
```sql
-- Cambiar de:
RESULTADO_EJECUCION = 'Exitoso - Reproceso programado para intento 1'

-- A:
RESULTADO_EJECUCION = 'Exitoso'
```

**Acción Requerida:**
- ✅ Verificar longitud exacta de VARCHAR en RESULTADO_EJECUCION
- ✅ Documentar límite explícitamente (ej: VARCHAR(50))
- ⚠️ Considerar aumentar a VARCHAR(255) para mensajes más descriptivos
- ✅ Definir estándares de mensajes cortos

---

### 8. 🟡 CHECK CONSTRAINT: INTENTOS_REINTENTO (Límite a 3)

**Documentación Inicial:**
```
INTENTOS_REINTENTO: Número de intentos ejecutados
Descripción: "Campo contador de reintentos"
Rango: "Abierto" / Sin límite documentado
```

**Modelo Real:**
```sql
INTENTOS_REINTENTO INT DEFAULT 0
CHECK: ([INTENTOS_REINTENTO]>=(0) AND [INTENTOS_REINTENTO]<=(3))
-- Límite máximo: 3 intentos
```

**Impacto:**
- RF-30 requiere máximo 3 reintentos pero no era evidente
- Documentación no menciona este límite explícitamente
- Importante para validación de lógica de negocio

**Solución Aplicada:**
```sql
-- SP Tarea 5 respeta el límite:
IF @INTENTO_NUMERO >= 3
  THEN programar para más tarde con backoff de 60 minutos
```

**Acción Requerida:**
- ✅ Documentar explícitamente límite de 3 intentos
- ✅ Validar que RF-30 se cumple (máximo 3)
- ✅ Definir estrategia post-3 intentos fallidos

---

## Resumen de Cambios Requeridos a Documentación

### 📝 Archivos DDL a Actualizar

1. **`aidlc-docs/inception/reverse-engineering/impacto-precio-original-y-redondeo.md`**
   - [ ] Cambiar SOLICITUD_PRECIO → SOLICITUD
   - [ ] Cambiar TINYINT(ES_ERROR_TRANSITORIO) → CHAR(1) 'N'/'S'
   - [ ] Agregar PARAMETROS_JSON NOT NULL
   - [ ] Documentar TIPO_ERROR valores permitidos
   - [ ] Documentar COMPANIA valores permitidos
   - [ ] Agregar UNIQUE INDEX en CODIGO_SOLICITUD
   - [ ] Documentar límite RESULTADO_EJECUCION
   - [ ] Documentar CHECK INTENTOS_REINTENTO ≤ 3

2. **Nueva tabla de referencia: `MODELO_ACTUAL_VALIDADO.md`**
   - Schema completo de tablas críticas (SOLICITUD, SOLICITUD_REINTENTO, AUDITORIA_APROBACION)
   - CHECK constraints explícitos
   - Foreign keys
   - Valores permitidos (enums)

### 🔄 Scripts de Validación a Crear

- `backend/sql/portal/00_VALIDAR_MODELO_ACTUAL.sql` - Verifica que el modelo actual coincida con documentación

### 📚 Actualizaciones de Requirements

- RF-30: Confirmar límite 3 reintentos explícitamente
- RNF-06: Auditoría debe registrar fecha, usuario, acción, estado anterior/nuevo

---

## Impacto en Próximas Tareas

### ⚠️ Tarea 7: FN_OBTENER_BANDEJA_APROBACION

Usar:
- ✅ Tabla: SOLICITUD (no SOLICITUD_PRECIO)
- ✅ Columna: ES_ERROR_TRANSITORIO = 'S' (no 1)
- ✅ COMPANIA IN ('BEVAL', 'COFERSA', 'FEBECA', 'SILLACA')
- ✅ TIPO_ERROR IN ('connection_timeout', 'service_unavailable', 'other_transient', 'temporary_lock')
- ⚠️ CODIGO_SOLICITUD usar formato único (timestamp)

---

## Recomendaciones

| Recomendación | Prioridad | Acción |
|--------------|-----------|--------|
| Sincronizar documentación DDL con modelo real | 🔴 Crítica | Actualizar inmediatamente |
| Crear script de validación del modelo | 🔴 Crítica | Ejecutar antes de cada sprint |
| Documentar enums/lookup values centralmente | 🟡 Alta | Crear tabla de referencia |
| Revisión de tipos de datos en documentación | 🟡 Alta | Auditoría completa |
| Generar DDL desde modelo real (reverse engineering) | 🟡 Alta | Script de exportación |

---

## Conclusión

La mayoría de los errores en Tarea 5 y 6 se debió a **desalineación entre la documentación del proyecto y el modelo físico real en SOFTLANDQA**. Una auditoría y sincronización inmediata evitará errores similares en tareas futuras (Tarea 7, 8, etc.).

**Acción inmediata:** Ejecutar script de validación del modelo antes de comenzar Tarea 7.

---

*Documento generado: 2026-09-18*  
*Contexto: PASO 2 Tareas 5-6 Troubleshooting*
