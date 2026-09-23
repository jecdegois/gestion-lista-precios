# PASO 2: Server-Side Scope Validation (Backend) - Plan de Trabajo

**Proyecto:** MV26020 - Gestión y Cálculo de Listas de Precio  
**Fase:** CONSTRUCTION - Server-Side Validation  
**Objetivo:** Desarrollar Stored Procedures y lógica de backend para aprobación  
**Fecha Inicio:** 2026-09-18  
**Base de Datos:** SOFTLANDQA.PORTAL_PRECIOS

---

## 📋 Tareas de PASO 2 (8 Tareas)

### Tarea 1: Stored Procedure - Aprobar Solicitud
**Objetivo:** Implementar lógica de aprobación con auditoría automática

**Descripción:**
- Validar que aprobador sea IDP_APROBADOR
- Actualizar ESTADO = 'APROBADA'
- Registrar en AUDITORIA_APROBACION (ACCION='APROBADA')
- Registrar FECHA_REVISION
- Retornar estado de éxito/error

**Input:**
- @ID_SOLICITUD INT
- @USUARIO_EMAIL VARCHAR(120)
- @USUARIO_NOMBRE VARCHAR(120)

**Output:**
- @P_RESULTADO VARCHAR(15) - 'EXITOSO' o 'ERROR'
- @P_MENSAJE VARCHAR(500)
- @P_ID_AUDITORIA BIGINT

**Validaciones:**
- ✅ Solicitud existe
- ✅ Estado es 'ENVIADA'
- ✅ Usuario tiene rol Aprobador
- ✅ Auditoría se registra

**Status:** ⏳ Por hacer

---

### Tarea 2: Stored Procedure - Rechazar Solicitud
**Objetivo:** Implementar lógica de rechazo con motivo obligatorio

**Descripción:**
- Validar que aprobador sea IDP_APROBADOR
- REQUIERE COMENTARIO (RNF-05: auditoría completa)
- Actualizar ESTADO = 'RECHAZADA'
- Registrar MOTIVO_RECHAZO
- Registrar en AUDITORIA_APROBACION (ACCION='RECHAZADA', COMENTARIO_DECISION)
- Notificación al solicitante (trigger de notificación)

**Input:**
- @ID_SOLICITUD INT
- @USUARIO_EMAIL VARCHAR(120)
- @USUARIO_NOMBRE VARCHAR(120)
- @COMENTARIO_DECISION VARCHAR(1000) - REQUERIDO

**Output:**
- @P_RESULTADO VARCHAR(15)
- @P_MENSAJE VARCHAR(500)
- @P_ID_AUDITORIA BIGINT

**Validaciones:**
- ✅ Solicitud existe
- ✅ Estado es 'ENVIADA'
- ✅ Usuario tiene rol Aprobador
- ✅ COMENTARIO_DECISION es obligatorio (CK_AUDITORIA_RECHAZO)

**Status:** ⏳ Por hacer

---

### Tarea 3: Stored Procedure - Solicitar Cancelación
**Objetivo:** Permitir al solicitante pedir cancelación

**Descripción:**
- Validar que solicitud esté en estado ENVIADA o EN_PROCESO
- CANCELACION_SOLICITADA = 'S'
- FECHA_SOLICITUD_CANCELACION = GETDATE()
- USUARIO_SOLICITA_CANCELACION = usuario solicitante
- Registrar en AUDITORIA_APROBACION (ACCION='CANCELACION_SOLICITADA')
- Notificación al aprobador

**Input:**
- @ID_SOLICITUD INT
- @USUARIO_EMAIL VARCHAR(120)
- @USUARIO_NOMBRE VARCHAR(120)

**Output:**
- @P_RESULTADO VARCHAR(15)
- @P_MENSAJE VARCHAR(500)

**Validaciones:**
- ✅ Solicitud en estado válido
- ✅ Usuario es solicitante
- ✅ No hay cancelación previa en curso

**Status:** ⏳ Por hacer

---

### Tarea 4: Stored Procedure - Confirmar/Denegar Cancelación
**Objetivo:** Aprobador confirma o deniega cancelación solicitada

**Descripción:**
- Validar que aprobador sea IDP_APROBADOR
- Si confirma:
  - CANCELACION_CONFIRMADA = 'S'
  - FECHA_CANCELACION = GETDATE()
  - USUARIO_DECIDE_CANCELACION = aprobador
  - ESTADO = 'CANCELADA'
  - ACCION = 'CANCELACION_CONFIRMADA'
- Si deniega:
  - ACCION = 'CANCELACION_DENEGADA'
  - Continúa procesamiento normal
- Registrar en AUDITORIA_APROBACION

**Input:**
- @ID_SOLICITUD INT
- @USUARIO_EMAIL VARCHAR(120)
- @USUARIO_NOMBRE VARCHAR(120)
- @ACCION VARCHAR(30) - 'CONFIRMAR' o 'DENEGAR'
- @COMENTARIO_DECISION VARCHAR(1000)

**Output:**
- @P_RESULTADO VARCHAR(15)
- @P_MENSAJE VARCHAR(500)

**Validaciones:**
- ✅ CANCELACION_SOLICITADA = 'S'
- ✅ Usuario es Aprobador
- ✅ ACCION es válida

**Status:** ⏳ Por hacer

---

### Tarea 5: Stored Procedure - Procesar Reintentos
**Objetivo:** Background job para reintentar solicitudes con errores transitorios

**Descripción:**
- Buscar SOLICITUD_REINTENTO donde:
  - PROXIMO_REINTENTO_PROGRAMADO <= GETDATE()
  - RESULTADO_REINTENTO IS NULL
  - INTENTO_NUMERO < 3
- Para cada reintento:
  - Simular reintento de SP (en PASO 3 será llamada real)
  - Actualizar RESULTADO_REINTENTO
  - Si éxito: RESULTADO_REINTENTO='EXITOSO', FECHA_FIN_EJECUCION=GETDATE()
  - Si falla: INTENTO_NUMERO++, calcular próximo reintento con backoff exponencial
- Registrar auditoría de reintentos

**Parámetros:**
- @P_MAX_REINTENTOS INT = 3
- @P_TIMEOUT_SEGUNDOS INT = 300

**Output:**
- @P_REINTENTOS_PROCESADOS INT
- @P_EXITOSOS INT
- @P_PENDIENTES INT
- @P_FALLIDOS INT

**Lógica de Backoff:**
- Intento 1: 5 minutos
- Intento 2: 15 minutos
- Intento 3: 60 minutos

**Status:** ⏳ Por hacer

---

### Tarea 6: Stored Procedure - Reprocesar Solicitud
**Objetivo:** Aprobador puede autorizar reprocesamiento de solicitud fallida

**Descripción:**
- Validar que aprobador sea IDP_APROBADOR
- Validar que INTENTO_NUMERO >= 3 (fallidos después de máximos reintentos)
- Crear nuevo ciclo de reintentos:
  - INTENTO_NUMERO = 0 (reiniciar contador)
  - PROXIMO_REINTENTO_PROGRAMADO = GETDATE() + 5 min
  - RESULTADO_REINTENTO = NULL
- Registrar en AUDITORIA_APROBACION (ACCION='REPROCESO_AUTORIZADO')

**Input:**
- @ID_SOLICITUD INT
- @USUARIO_EMAIL VARCHAR(120)
- @USUARIO_NOMBRE VARCHAR(120)
- @COMENTARIO_DECISION VARCHAR(1000)

**Output:**
- @P_RESULTADO VARCHAR(15)
- @P_MENSAJE VARCHAR(500)
- @P_ID_AUDITORIA BIGINT

**Validaciones:**
- ✅ Usuario es Aprobador
- ✅ Solicitud tiene reintentos fallidos
- ✅ Se registra auditoría

**Status:** ⏳ Por hacer

---

### Tarea 7: Función - Obtener Bandeja de Aprobación
**Objetivo:** Query optimizada para listar solicitudes pendientes por aprobador

**Descripción:**
- Función table-valued que retorna solicitudes pendientes
- Filtros:
  - ESTADO IN ('ENVIADA', 'RECHAZADA_MODIFICACION')
  - IDP_APROBADOR = @APROBADOR_ID o APROBADOR_EMAIL = @EMAIL
  - FECHA_ENVIO IS NOT NULL
- Retorna:
  - ID_SOLICITUD, CODIGO_SOLICITUD, COMPANIA, ESTADO
  - FECHA_ENVIO, TOTAL_REGISTROS, EXITOSOS, FALLIDOS
  - Contador de reintentos pendientes
  - Cancelaciones solicitadas

**Input:**
- @USUARIO_EMAIL VARCHAR(120)

**Output:**
```
ID_SOLICITUD, CODIGO_SOLICITUD, COMPANIA, ESTADO, 
FECHA_ENVIO, TOTAL_REGISTROS, EXITOSOS, FALLIDOS,
REINTENTOS_PENDIENTES, CANCELACION_SOLICITADA
```

**Performance:**
- Debe usar índice IX_PP_SOL_ESTADO
- Máximo 10K registros

**Status:** ⏳ Por hacer

---

### Tarea 8: Función - Obtener Detalles Solicitud con Auditoría
**Objetivo:** Query optimizada para modal de detalles + historial

**Descripción:**
- Función table-valued que retorna:
  - Datos de SOLICITUD (completos)
  - Datos de SOLICITUD_DETALLE (líneas)
  - Historial de AUDITORIA_APROBACION
  - Historial de SOLICITUD_REINTENTO
- Filtrado por ID_SOLICITUD

**Input:**
- @ID_SOLICITUD INT

**Output:**
```
-- SOLICITUD
ID_SOLICITUD, CODIGO_SOLICITUD, ESTADO, FECHA_ENVIO, FECHA_MODIFICACION,
APROBADOR_EMAIL, MOTIVO_RECHAZO, CANCELACION_SOLICITADA, CANCELACION_CONFIRMADA,
ES_ERROR_TRANSITORIO, CODIGO_ERROR, MENSAJE_ERROR,
FECHA_INICIO_EJECUCION, FECHA_FIN_EJECUCION

-- DETALLES (líneas)
ARTICULO, PRECIO_ORIGINAL, PRECIO_PROPUESTO, CANTIDAD, TOTAL

-- AUDITORÍA (decisiones)
FECHA_AUDITORIA, USUARIO_EMAIL, ACCION, COMENTARIO_DECISION, RESULTADO

-- REINTENTOS
INTENTO_NUMERO, TIPO_ERROR, FECHA_INTENTO, RESULTADO_REINTENTO
```

**Performance:**
- Usar índices compuestos (ID_SOLICITUD, FECHA)

**Status:** ⏳ Por hacer

---

## 📅 Cronograma

| Tarea | Horas Est. | Prioridad | Status |
|-------|-----------|-----------|--------|
| 1. SP Aprobar | 3h | CRÍTICA | ⏳ |
| 2. SP Rechazar | 3h | CRÍTICA | ⏳ |
| 3. SP Solicitar Cancelación | 2h | ALTA | ⏳ |
| 4. SP Confirmar Cancelación | 3h | ALTA | ⏳ |
| 5. SP Procesar Reintentos | 4h | CRÍTICA | ⏳ |
| 6. SP Reprocesar Solicitud | 2h | ALTA | ⏳ |
| 7. FN Bandeja Aprobación | 2h | CRÍTICA | ⏳ |
| 8. FN Detalles + Auditoría | 3h | CRÍTICA | ⏳ |
| **Testing + Ajustes** | **8h** | CRÍTICA | ⏳ |
| **TOTAL** | **30h** | | |

---

## 🎯 Próximos Pasos

1. **Tarea 1:** Crear SP_APROBAR_SOLICITUD
2. **Tarea 2:** Crear SP_RECHAZAR_SOLICITUD
3. **Tarea 3-4:** Crear SPs de cancelación
4. **Tarea 5-6:** Crear SPs de reintentos
5. **Tarea 7-8:** Crear Funciones de lectura
6. **Testing:** Validar todas las SPs

---

**PASO 2: Listo para comenzar desarrollo de Stored Procedures**
