# Plan de Transición: PASO 2 (Simulación) → PASO 3 (Integración Real)

**Proyecto:** MV26020 - Gestión de Listas de Precio  
**Documento de Referencia:** Para usar cuando inicie PASO 3  
**Tarea Afectada:** Tarea 5 - sp_procesar_reintentos  

---

## 📋 Resumen Ejecutivo

En PASO 2, Tarea 5 implementa `sp_procesar_reintentos` con **simulación de errores** para validar la lógica de reintentos, backoff exponencial y auditoría.

En PASO 3, esta simulación se reemplaza con **lógica real de cálculo de precios**, manteniendo toda la arquitectura de reintentos intacta.

**Cambio de Alto Nivel:**
```
PASO 2: Simular ejecución → Generar error aleatorio
PASO 3: Ejecutar lógica real → Capturar error real
```

---

## 🔍 Dónde Está el Código de Simulación

**Archivo:** `backend/sql/portal/PASO2_TAREA5_SP_PROCESAR_REINTENTOS.sql`

**Líneas aproximadas:** 150-200

**Sección a Reemplazar:**
```sql
-- -------- FASE 1: SIMULAR EJECUCIÓN DE SOLICITUD --------
-- En PASO 3 será reemplazado con lógica real de cálculo de precios

DECLARE @v_resultado_simulado VARCHAR(20);
DECLARE @v_error_aleatorio FLOAT;

-- Generar error aleatorio (simulación para testing)
SET @v_error_aleatorio = RAND();

-- Distribución de resultados:
-- 30% exitoso, 20% timeout, 20% deadlock, 15% connection_lost, 15% validation_error
IF @v_error_aleatorio < 0.30
    SET @v_resultado_simulado = 'EXITOSO'
ELSE IF @v_error_aleatorio < 0.50
    SET @v_resultado_simulado = 'TIMEOUT'
ELSE IF @v_error_aleatorio < 0.70
    SET @v_resultado_simulado = 'DEADLOCK'
ELSE IF @v_error_aleatorio < 0.85
    SET @v_resultado_simulado = 'CONNECTION_LOST'
ELSE
    SET @v_resultado_simulado = 'VALIDATION_ERROR';
```

---

## ✅ Checklist de Transición

### Paso 1: Identificar Lógica Real de Cálculo
- [ ] Ubicar SP de cálculo de precios (ej: `sp_calcular_precios_lista`)
- [ ] Confirmar contrato de entrada/salida
- [ ] Documentar posibles errores que puede retornar
- [ ] Validar que el SP retorna estado success/error

**Ejemplo esperado:**
```sql
EXEC sp_calcular_precios_lista
    @ID_SOLICITUD = 123,
    @RESULTADO OUTPUT = 'EXITOSO' | 'ERROR',
    @ERROR_CODE OUTPUT = NULL | 'TIMEOUT' | 'DEADLOCK' | etc
```

### Paso 2: Mapear Errores Reales a Tipos
- [ ] TIMEOUT real → Mapear a 'TIMEOUT'
- [ ] Deadlock SQL Server → Mapear a 'DEADLOCK'
- [ ] Conexión perdida → Mapear a 'CONNECTION_LOST'
- [ ] Validación fallida → Mapear a 'VALIDATION_ERROR'
- [ ] Otros → Mapear a tipo apropiado

### Paso 3: Reemplazar Simulación (5-10 líneas de cambio)
- [ ] Eliminar código RAND() y IF...ELSE simulación
- [ ] Insertar llamada a SP real
- [ ] Capturar error desde SP o TRY...CATCH
- [ ] Validar que variable `@v_resultado_simulado` sigue recibiendo valor correcto
- [ ] Testear con 5+ casos reales

### Paso 4: Validar Compatibilidad de Interfaces
- [ ] Variable `@v_resultado_simulado` sigue siendo STRING de 20 caracteres
- [ ] Los valores posibles siguen siendo: EXITOSO, TIMEOUT, DEADLOCK, CONNECTION_LOST, VALIDATION_ERROR
- [ ] El resto del código (clasificación, backoff, auditoría) **NO cambia**

### Paso 5: Tests
- [ ] TEST 1: Éxito real (no simulado)
- [ ] TEST 2: Timeout real
- [ ] TEST 3: Agotamiento de reintentos con errores reales
- [ ] TEST 4: Error no-retryeable real
- [ ] TEST 5: Batch con mezcla de éxito/fallo reales

---

## 🔄 Cambio Exacto en el Código

### ANTES (PASO 2 - Simulación)

**Ubicación:** `PASO2_TAREA5_SP_PROCESAR_REINTENTOS.sql` líneas ~150-200

```sql
BEGIN TRY
    -- -------- FASE 1: SIMULAR EJECUCIÓN DE SOLICITUD --------
    
    DECLARE @v_resultado_simulado VARCHAR(20);
    DECLARE @v_error_aleatorio FLOAT;
    
    SET @v_error_aleatorio = RAND();
    
    IF @v_error_aleatorio < 0.30
        SET @v_resultado_simulado = 'EXITOSO'
    ELSE IF @v_error_aleatorio < 0.50
        SET @v_resultado_simulado = 'TIMEOUT'
    ELSE IF @v_error_aleatorio < 0.70
        SET @v_resultado_simulado = 'DEADLOCK'
    ELSE IF @v_error_aleatorio < 0.85
        SET @v_resultado_simulado = 'CONNECTION_LOST'
    ELSE
        SET @v_resultado_simulado = 'VALIDATION_ERROR';
    
    -- -------- FASE 2: PROCESAR RESULTADO --------
    
    IF @v_resultado_simulado = 'EXITOSO'
    BEGIN
        -- ... resto del código (INTACTO)
    END
```

### DESPUÉS (PASO 3 - Integración Real)

```sql
BEGIN TRY
    -- -------- FASE 1: EJECUTAR LÓGICA REAL DE CÁLCULO --------
    
    DECLARE @v_resultado_simulado VARCHAR(20);  -- Renombrar a @v_resultado_real (opcional)
    DECLARE @v_error_code VARCHAR(40);
    DECLARE @v_mensaje_error VARCHAR(500);
    
    -- Llamar SP real de cálculo de precios
    BEGIN TRY
        EXEC sp_calcular_precios_lista
            @ID_SOLICITUD = @v_id_solicitud,
            @RESULTADO = @v_resultado_simulado OUTPUT,
            @ERROR_CODE = @v_error_code OUTPUT,
            @MENSAJE_ERROR = @v_mensaje_error OUTPUT;
    END TRY
    BEGIN CATCH
        -- Si SP falla completamente
        SET @v_resultado_simulado = 'ERROR';
        SET @v_error_code = 'SP_EXECUTION_ERROR';
        SET @v_mensaje_error = ERROR_MESSAGE();
    END CATCH
    
    -- -------- FASE 2: PROCESAR RESULTADO --------
    
    IF @v_resultado_simulado = 'EXITOSO'
    BEGIN
        -- ... resto del código (INTACTO)
    END
```

**Cambios totales:**
- ✅ Líneas reemplazadas: ~15 líneas (de ~10 simulación a ~20 integración)
- ✅ Resto del SP: **SIN CAMBIOS**
- ✅ Interface de auditoría: **IDÉNTICA**
- ✅ Lógica de backoff: **IDÉNTICA**

---

## 🎯 Garantías de Compatibilidad

**Lo que NO cambia en PASO 3:**

✅ Estructura de cursor (busca PROXIMO_REINTENTO_PROGRAMADO <= AHORA)  
✅ Clasificación de errores (transitorio vs no-transitorio)  
✅ Lógica de backoff exponencial (5 → 15 → 60 minutos)  
✅ Actualización de tablas (SOLICITUD_REINTENTO, SOLICITUD)  
✅ Auditoría de eventos (5 tipos: EXITOSO, PROGRAMADO, AGOTADO, NO_VALIDO)  
✅ Parámetros de salida (@P_REINTENTOS_PROCESADOS, @P_EXITOSOS, etc.)  
✅ Manejo de errores (TRY...CATCH)  
✅ Performance (cursor + batch de 1000)  

**Lo que SÍ cambia:**

❌ Solo líneas de simulación → Líneas de integración real  
❌ Fuente de datos (RAND() → SP real)  
❌ Distribución de errores (aleatoria → real)  

---

## 📦 Archivos a Actualizar

**Archivo Principal:** `backend/sql/portal/PASO2_TAREA5_SP_PROCESAR_REINTENTOS.sql`

1. Copiar a: `backend/sql/portal/PASO3_TAREA5_SP_PROCESAR_REINTENTOS.sql` (nueva versión con integración)
2. Reemplazar bloque de simulación (~10-15 líneas)
3. Agregar documentación de cambio

**Archivos de Testing:**
- `PASO2_TAREA5_TESTS.sql` → Mantener como referencia
- Crear `PASO3_TAREA5_TESTS_REALES.sql` con datos reales

---

## 🚀 Flujo de Actualización en PASO 3

```
PASO 3 INICIA
│
├─→ Leer este documento (PLAN_TRANSICION_PASO2_A_PASO3.md)
│
├─→ Identificar SP real de cálculo de precios
│   └─→ Documentar contrato de entrada/salida
│
├─→ Crear PASO3_TAREA5_SP_PROCESAR_REINTENTOS.sql
│   └─→ Copiar PASO2_TAREA5_SP_PROCESAR_REINTENTOS.sql
│   └─→ Reemplazar bloque de simulación
│   └─→ Testear cambio
│
├─→ Crear PASO3_TAREA5_TESTS_REALES.sql
│   └─→ Tests con datos reales (no aleatorios)
│
├─→ Ejecutar y validar
│   └─→ Verificar RF-29, RF-30, RNF-06 con datos reales
│
└─→ PASO 3 COMPLETO
```

---

## ⚠️ Riesgos y Mitigaciones

| Riesgo | Mitigation |
|--------|-----------|
| SP real tiene interface diferente | Crear adaptador/wrapper SP que unifique interface |
| SP real retorna errores diferentes | Mapear códigos de error reales a nuestros tipos (TIMEOUT, DEADLOCK, etc.) |
| SP real tiene timeouts inesperados | Usar parámetro `@P_TIMEOUT_SEGUNDOS` existente |
| Cambio rompe backoff o auditoría | Todos estos quedan intactos; solo fuente de datos cambia |
| Tests de PASO 2 fallan | Tests de PASO 2 siguen siendo válidos (asserción de lógica); crear TEST 3 específicos para datos reales |

---

## ✅ Criterios de Éxito en PASO 3

- [ ] SP PASO3_TAREA5_SP_PROCESAR_REINTENTOS creado y funcional
- [ ] Llama SP real de cálculo de precios
- [ ] RF-29 sigue siendo 100% (reintentos funcionales con errores reales)
- [ ] RF-30 sigue siendo 100% (límite 3, estado final correcto)
- [ ] RNF-06 sigue siendo 100% (auditoría registra eventos reales)
- [ ] 5 tests con datos reales pasan
- [ ] Performance: procesa 1000+ reintentos sin problemas
- [ ] Auditoría correlaciona correctamente con solicitudes reales

---

## 📞 Preguntas a Resolver en PASO 3

Cuando llegues a PASO 3, asegúrate de responder:

1. **¿Cuál es el SP real de cálculo?**
   - Nombre: `_________________`
   - Schema: `_________________`
   - Parámetros entrada: `_________________`
   - Parámetros salida: `_________________`

2. **¿Qué errores puede retornar?**
   - TIMEOUT: Sí / No
   - DEADLOCK: Sí / No
   - CONNECTION_LOST: Sí / No
   - VALIDATION_ERROR: Sí / No
   - Otros: `_________________`

3. **¿Dónde viven los datos reales de prueba?**
   - DB: `_________________`
   - Tabla: `_________________`
   - Compañía: `_________________`

4. **¿Hay dependencias o preparación previa?**
   - `_________________`

---

## 📝 Notas Finales

- Este plan mantiene **100% compatibilidad** entre PASO 2 y PASO 3
- El cambio es **local** (solo líneas de simulación)
- La arquitectura de reintentos es **agnóstica** a la fuente de datos
- Los tests de PASO 2 siguen siendo válidos como **prueba de estructura**
- PASO 3 agrega tests con **datos reales** (no simulados)

**Tiempo estimado para transición:** 1-2 horas  
**Complejidad:** Baja (cambio localizado)  
**Riesgo:** Muy bajo (lógica no cambia, solo fuente de errores)

---

**Documento Preparado:** 2026-09-18  
**Aplica a:** PASO 3 (cuando comience)  
**Referencia:** Tarea 5 - sp_procesar_reintentos

