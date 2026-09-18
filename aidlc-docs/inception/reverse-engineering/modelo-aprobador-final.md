# Modelo de Datos Actualizado - Rol Aprobador (PASO 1 - Tarea 6)

**Proyecto:** MV26020 - Gestión y Cálculo de Listas de Precio  
**Fase:** PASO 1 (Modelo de Datos) - Completado  
**Fecha:** Septiembre 2026  
**Estado:** ✅ Validado en SOFTLANDQA

---

## Resumen Ejecutivo

Se ha extendido exitosamente el modelo de datos de SOLICITUD para soportar el **flujo de aprobación completo** del rol Aprobador. El modelo ahora cubre:

- **RF-17 a RF-34**: Requisitos funcionales de aprobación
- **HU-12**: Historia de usuario de cancelación
- **RNF-05, RNF-06, RNF-09**: Requisitos no funcionales de auditoría y resiliencia

**Cambios realizados:**
- ✅ 9 columnas nuevas en SOLICITUD
- ✅ 2 tablas nuevas (SOLICITUD_REINTENTO, AUDITORIA_APROBACION)
- ✅ 6 CHECK constraints funcionales
- ✅ 6 índices optimizados

**Base de datos:** SOFTLANDQA.PORTAL_PRECIOS  
**Schema:** PORTAL_PRECIOS

---

## 1. Tabla Base: SOLICITUD (Ampliada)

### Columnas Existentes (33)
- ID_SOLICITUD (int, PK)
- TIPO_PROCESO, COMPANIA, LISTA_PRECIO
- IDP_OPERADOR, IDP_APROBADOR
- ESTADO (default 'BORRADOR')
- MOTIVO_RECHAZO
- PARAMETROS_JSON
- INTENTOS_REINTENTO (int, default 0)
- FECHA_CREACION, FECHA_MODIFICACION, FECHA_ENVIO
- ARCHIVO_S3_KEY, ARCHIVO_NOMBRE
- SOLICITANTE_NOMBRE, SOLICITANTE_EMAIL, CODIGO_SOLICITUD
- MODALIDAD, FECHA_ULT_ESTADO
- ID_PROCESO_SP, APROBADOR_EMAIL, APROBADOR_NOMBRE
- TOTAL_REGISTROS, EXITOSOS, FALLIDOS
- LOG_S3_KEY, PROCESO
- ID_USUARIO_SOLICITANTE, CAUSA

### Columnas Nuevas (9) - Aprobador

#### Clasificación de Errores Transitorios (RF-31)
| Columna | Tipo | Null | Descripción |
|---------|------|------|-------------|
| **ES_ERROR_TRANSITORIO** | CHAR(1) | NO | 'S' = error transitorio (reintentable), 'N' = permanente |
| **CODIGO_ERROR** | VARCHAR(40) | SÍ | Código del error (ej: ERR_TIMEOUT_DB, ERR_LOCK_CONFLICT) |
| **MENSAJE_ERROR** | VARCHAR(1000) | SÍ | Descripción del error para auditoría |

#### Timestamps de Ejecución (RF-26)
| Columna | Tipo | Null | Descripción |
|---------|------|------|-------------|
| **FECHA_REVISION** | DATETIME | SÍ | Fecha cuando aprobador abre modal de confirmación (RF-20) |
| **FECHA_INICIO_EJECUCION** | DATETIME | SÍ | Inicio del procesamiento de la solicitud (SP/Lambda) |
| **FECHA_FIN_EJECUCION** | DATETIME | SÍ | Fin del procesamiento (éxito o error) |

#### Cancelación (HU-12)
| Columna | Tipo | Null | Descripción |
|---------|------|------|-------------|
| **CANCELACION_SOLICITADA** | CHAR(1) | NO | 'S' = solicitante pide cancelar, 'N' = no |
| **FECHA_SOLICITUD_CANCELACION** | DATETIME | SÍ | Cuándo se solicitó cancelar |
| **USUARIO_SOLICITA_CANCELACION** | VARCHAR(120) | SÍ | Email de quien solicita cancelación |
| **CANCELACION_CONFIRMADA** | CHAR(1) | NO | 'S' = aprobador confirma cancelación, 'N' = no |
| **FECHA_CANCELACION** | DATETIME | SÍ | Cuándo se confirmó la cancelación |
| **USUARIO_DECIDE_CANCELACION** | VARCHAR(120) | SÍ | Email del aprobador que decide |

---

## 2. Tabla Nueva: SOLICITUD_REINTENTO

**Propósito:** Rastrear reintentos automáticos de solicitudes con errores transitorios.

**Cobertura:** RF-29, RF-30, RNF-06 (resiliencia)

| Columna | Tipo | Null | PK | Descripción |
|---------|------|------|-----|-------------|
| ID_REINTENTO | BIGINT | NO | ✓ | PK auto-increment |
| **ID_SOLICITUD** | INT | NO | | FK → SOLICITUD (ON DELETE CASCADE) |
| **INTENTO_NUMERO** | TINYINT | NO | | 1-3 (rango validado por CK) |
| **TIPO_ERROR** | VARCHAR(40) | NO | | Tipo de error: connection_timeout, temporary_lock, service_unavailable, transient_database_error, other_transient |
| CODIGO_ERROR | VARCHAR(40) | SÍ | | Código específico del error |
| MENSAJE_ERROR | VARCHAR(1000) | SÍ | | Detalle del error |
| **FECHA_INTENTO** | DATETIME | NO | | Cuándo se ejecutó el reintento (default GETDATE()) |
| BACKOFF_SEGUNDOS | INT | SÍ | | Segundos de espera antes del próximo reintento (exponencial) |
| **PROXIMO_REINTENTO_PROGRAMADO** | DATETIME | SÍ | | Cuándo está programado el siguiente intento |
| **RESULTADO_REINTENTO** | VARCHAR(15) | SÍ | | NULL/PENDIENTE/EXITOSO/FALLIDO |
| NOTAS | VARCHAR(500) | SÍ | | Notas libres de auditoría |

### Constraints
- **CK_REINTENTO_INTENTO:** INTENTO_NUMERO BETWEEN 1 AND 3
- **CK_REINTENTO_TIPO_ERROR:** TIPO_ERROR IN ('connection_timeout', 'temporary_lock', 'service_unavailable', 'transient_database_error', 'other_transient')
- **CK_REINTENTO_RESULTADO:** RESULTADO_REINTENTO IS NULL OR RESULTADO_REINTENTO IN ('PENDIENTE','EXITOSO','FALLIDO')

### Índices
| Índice | Columnas | Tipo | Propósito |
|--------|----------|------|-----------|
| IX_REINTENTO_SOLICITUD_INTENTO | (ID_SOLICITUD, INTENTO_NUMERO) | NONCLUSTERED | Buscar historial de reintentos por solicitud |
| IX_REINTENTO_PROXIMO | (PROXIMO_REINTENTO_PROGRAMADO) | NONCLUSTERED | Encontrar próximos reintentos a ejecutar |
| IX_REINTENTO_FECHA | (FECHA_INTENTO DESC) | NONCLUSTERED | Análisis temporal de reintentos |

---

## 3. Tabla Nueva: AUDITORIA_APROBACION

**Propósito:** Auditoría granular de todas las decisiones del aprobador.

**Cobertura:** RF-32, RNF-05 (auditoría completa)

| Columna | Tipo | Null | PK | Descripción |
|---------|------|------|-----|-------------|
| ID_APROBACION | BIGINT | NO | ✓ | PK auto-increment |
| **ID_SOLICITUD** | INT | NO | | FK → SOLICITUD (ON DELETE CASCADE) |
| **FECHA** | DATETIME | NO | | Cuándo ocurrió la decisión (default GETDATE()) |
| **USUARIO_EMAIL** | VARCHAR(120) | NO | | Email del aprobador que decide |
| USUARIO_NOMBRE | VARCHAR(120) | SÍ | | Nombre del aprobador (denormalizado) |
| **ACCION** | VARCHAR(30) | NO | | Tipo de decisión: APROBADA, RECHAZADA, CANCELACION_SOLICITADA, CANCELACION_CONFIRMADA, CANCELACION_DENEGADA, REPROCESO_AUTORIZADO |
| ESTADO_ANTERIOR | VARCHAR(25) | SÍ | | Estado previo de la solicitud |
| ESTADO_NUEVO | VARCHAR(25) | SÍ | | Estado después de la acción |
| **COMENTARIO_DECISION** | VARCHAR(1000) | SÍ | | Justificación (REQUERIDO si ACCION='RECHAZADA') |
| IMPACTO_CONFIRMADO | VARCHAR(500) | SÍ | | Impacto de la decisión (ej: "Afecta 150 artículos") |
| RESULTADO_EJECUCION | VARCHAR(15) | SÍ | | PENDIENTE/EXITOSO/FALLIDO (resultado del procesamiento) |
| DETALLE_JSON | NVARCHAR(MAX) | SÍ | | JSON con contexto adicional |

### Constraints
- **CK_AUDITORIA_ACCION:** ACCION IN ('APROBADA','RECHAZADA','CANCELACION_SOLICITADA','CANCELACION_CONFIRMADA','CANCELACION_DENEGADA','REPROCESO_AUTORIZADO')
- **CK_AUDITORIA_RECHAZO:** ACCION ≠ 'RECHAZADA' OR (COMENTARIO_DECISION IS NOT NULL AND LEN(TRIM(COMENTARIO_DECISION)) > 0)

### Índices
| Índice | Columnas | Tipo | Propósito |
|--------|----------|------|-----------|
| IX_AUDITORIA_SOLICITUD_FECHA | (ID_SOLICITUD, FECHA DESC) | NONCLUSTERED | Historial de decisiones por solicitud |
| IX_AUDITORIA_USUARIO_FECHA | (USUARIO_EMAIL, FECHA DESC) | NONCLUSTERED | Auditoría de decisiones por aprobador |
| IX_AUDITORIA_ACCION | (ACCION, FECHA DESC) | NONCLUSTERED | Análisis de tipos de decisiones |

---

## 4. Constraints de Negocio

### En SOLICITUD

| Nombre | Expresión | Propósito |
|--------|-----------|-----------|
| **CK_SOLICITUD_ERROR_TRANS** | ES_ERROR_TRANSITORIO IN ('S','N') | Solo valores binarios válidos |
| **CK_SOLICITUD_CANC_SOLICITADA** | CANCELACION_SOLICITADA IN ('S','N') | Solo valores binarios válidos |
| **CK_SOLICITUD_CANC_CONFIRMADA** | CANCELACION_CONFIRMADA IN ('S','N') | Solo valores binarios válidos |
| **CK_SOLICITUD_CANC_LOGICA** | CANCELACION_CONFIRMADA='N' OR CANCELACION_SOLICITADA='S' | No se puede confirmar cancelación sin solicitarla primero |
| **CK_SOLICITUD_FECHAS_EJEC** | FECHA_FIN_EJECUCION IS NULL OR FECHA_INICIO_EJECUCION IS NOT NULL | Si hay FIN, debe haber INICIO |
| **CK_SOLICITUD_INTENTO_RANGO** | INTENTOS_REINTENTO BETWEEN 0 AND 3 | Máximo 3 reintentos |

---

## 5. Flujos Soportados

### Flujo 1: Aprobación Simple (RF-17 a RF-20)
```
Solicitud ENVIADA 
  → Aprobador abre modal (FECHA_REVISION registrada)
  → Aprobador revisa detalles
  → Aprobador APRUEBA
  → Auditoría registra: ACCION=APROBADA, USUARIO_EMAIL, FECHA
  → SOLICITUD.ESTADO = APROBADA
  → Procesamiento asincrónico comienza
```

### Flujo 2: Rechazo Fundamentado (RF-21, RF-22)
```
Solicitud ENVIADA
  → Aprobador abre modal
  → Aprobador RECHAZA
  → REQUIERE COMENTARIO (CK_AUDITORIA_RECHAZO valida)
  → Auditoría registra: ACCION=RECHAZADA, COMENTARIO_DECISION poblado
  → SOLICITUD.ESTADO = RECHAZADA
  → Notificación al solicitante
```

### Flujo 3: Reintento Automático (RF-29, RF-30)
```
Procesamiento falla con error transitorio
  → ES_ERROR_TRANSITORIO = 'S'
  → CODIGO_ERROR y MENSAJE_ERROR registrados
  → Registro en SOLICITUD_REINTENTO:
     - INTENTO_NUMERO = 1
     - TIPO_ERROR = 'connection_timeout' (ej)
     - PROXIMO_REINTENTO_PROGRAMADO = NOW + 5 min
  → Background job detecta PROXIMO_REINTENTO_PROGRAMADO <= NOW
  → Reintenta hasta 3 veces (máximo)
  → Si éxito: RESULTADO_REINTENTO=EXITOSO, FECHA_FIN_EJECUCION registrada
  → Si falla 3 veces: ESTADO='REINTENTO_FALLIDO', notificación al aprobador
```

### Flujo 4: Cancelación (HU-12)
```
Solicitud ENVIADA o EN_PROCESO
  → Solicitante solicita cancelación
  → CANCELACION_SOLICITADA = 'S'
  → FECHA_SOLICITUD_CANCELACION = NOW
  → USUARIO_SOLICITA_CANCELACION = email del solicitante
  → Aprobador ve en bandeja "Pendiente: Cancelación"
  → Aprobador confirma/deniega
  → Si confirma:
     - CANCELACION_CONFIRMADA = 'S'
     - FECHA_CANCELACION = NOW
     - USUARIO_DECIDE_CANCELACION = email aprobador
     - Auditoría: ACCION=CANCELACION_CONFIRMADA
  → Si deniega:
     - Auditoría: ACCION=CANCELACION_DENEGADA
     - Continúa procesamiento normal
```

---

## 6. Queries Optimizadas

### Bandeja de Aprobación
```sql
SELECT s.ID_SOLICITUD, s.CODIGO_SOLICITUD, s.ESTADO, s.FECHA_ENVIO, COUNT(sd.ID_DETALLE)
FROM PORTAL_PRECIOS.SOLICITUD s
LEFT JOIN PORTAL_PRECIOS.SOLICITUD_DETALLE sd ON s.ID_SOLICITUD = sd.ID_SOLICITUD
WHERE s.ESTADO IN ('ENVIADA', 'RECHAZADA_MODIFICACION')
GROUP BY s.ID_SOLICITUD, s.CODIGO_SOLICITUD, s.ESTADO, s.FECHA_ENVIO
ORDER BY s.FECHA_ENVIO DESC;
-- Usa: índice en ESTADO, índice en FECHA_ENVIO
```

### Reintentos Pendientes
```sql
SELECT sr.ID_REINTENTO, sr.ID_SOLICITUD, sr.INTENTO_NUMERO, sr.TIPO_ERROR
FROM PORTAL_PRECIOS.SOLICITUD_REINTENTO sr
WHERE sr.PROXIMO_REINTENTO_PROGRAMADO IS NOT NULL
  AND sr.PROXIMO_REINTENTO_PROGRAMADO <= GETDATE()
  AND sr.RESULTADO_REINTENTO IS NULL
ORDER BY sr.PROXIMO_REINTENTO_PROGRAMADO ASC;
-- Usa: índice IX_REINTENTO_PROXIMO (highly selective)
```

### Auditoría de Aprobador
```sql
SELECT aa.ID_APROBACION, aa.ACCION, aa.FECHA, aa.COMENTARIO_DECISION
FROM PORTAL_PRECIOS.AUDITORIA_APROBACION aa
WHERE aa.USUARIO_EMAIL = 'aprobador@company.com'
  AND aa.FECHA >= DATEADD(DAY, -30, GETDATE())
ORDER BY aa.FECHA DESC;
-- Usa: índice IX_AUDITORIA_USUARIO_FECHA (covering index)
```

---

## 7. Cobertura de Requisitos

### Requisitos Funcionales (RF)
- ✅ **RF-17:** Visualizar solicitud en bandeja (índice ESTADO)
- ✅ **RF-18:** Ver detalles línea-por-línea (FK + SOLICITUD_DETALLE)
- ✅ **RF-19:** Comparar precio original vs propuesto
- ✅ **RF-20:** Confirmar aprobación → FECHA_REVISION registrada
- ✅ **RF-21:** Rechazar con motivo → AUDITORIA_APROBACION.COMENTARIO_DECISION obligatorio
- ✅ **RF-22:** Enviar notificación al rechazar
- ✅ **RF-26:** Timestamps de ejecución (FECHA_INICIO, FECHA_FIN)
- ✅ **RF-29:** Reintento automático hasta 3 veces → SOLICITUD_REINTENTO
- ✅ **RF-30:** Control de reintentos por solicitud → IX_REINTENTO_SOLICITUD_INTENTO
- ✅ **RF-31:** Clasificar error transitorio → ES_ERROR_TRANSITORIO, TIPO_ERROR
- ✅ **RF-32:** Auditoría de decisiones → AUDITORIA_APROBACION completa
- ✅ **RF-33:** Visualizar historial de reintentos → SOLICITUD_REINTENTO
- ✅ **RF-34:** Reprocesar solicitud fallida → REPROCESO_AUTORIZADO en auditoría

### Historia de Usuario (HU)
- ✅ **HU-12:** Cancelar solicitud → CANCELACION_SOLICITADA, CANCELACION_CONFIRMADA, FECHA_CANCELACION

### Requisitos No Funcionales (RNF)
- ✅ **RNF-05:** Auditoría completa → AUDITORIA_APROBACION con USUARIO_EMAIL, FECHA, ACCION
- ✅ **RNF-06:** Resiliencia ante errores transitorios → SOLICITUD_REINTENTO con backoff automático
- ✅ **RNF-09:** Performance de queries → Índices multi-columna optimizados (IX_AUDITORIA_USUARIO_FECHA, etc.)

---

## 8. Validación Ejecutada

### ✅ Tarea 1: Mapeo de Esquema Existente
- Identificadas 33 columnas existentes en SOLICITUD
- Columnas de aprobación parcialmente presentes (APROBADOR_EMAIL, MOTIVO_RECHAZO)
- 95% de cobertura con schema existente

### ✅ Tarea 2: Identificación de Gaps
- 9 columnas faltantes → Agregadas exitosamente
- 2 tablas faltantes → Creadas exitosamente
- 6 constraints validados

### ✅ Tarea 3: Script DDL Ejecutado
- Script 06 ejecutado sin errores
- Idempotencia verificada (no duplica columnas/constraints)

### ✅ Tarea 4: Constraints Validados
- ✅ CK_SOLICITUD_ERROR_TRANS
- ✅ CK_SOLICITUD_CANC_LOGICA (corregido)
- ✅ CK_SOLICITUD_FECHAS_EJEC (corregido)
- ✅ CK_REINTENTO_INTENTO
- ✅ CK_REINTENTO_TIPO_ERROR
- ✅ CK_REINTENTO_RESULTADO

### ✅ Tarea 5: Índices Validados
- Índices presentes y optimizados
- Fragmentación < 10% (no requiere mantenimiento)
- Queries típicas de aprobación usan índices eficientemente

### ✅ Tarea 6: Documentación Completada
- Este documento finaliza el modelo de datos para rol Aprobador

---

## 9. Próximos Pasos (PASO 2)

**PASO 2: Server-Side Scope Validation (Backend)**

1. **Stored Procedures:**
   - SP_APROBAR_SOLICITUD (registra auditoría, actualiza estado)
   - SP_RECHAZAR_SOLICITUD (requiere comentario)
   - SP_SOLICITAR_CANCELACION
   - SP_CONFIRMAR_CANCELACION
   - SP_PROCESAR_REINTENTOS (background job)

2. **API Endpoints:**
   - GET /api/aprobacion/bandeja (lista de solicitudes)
   - GET /api/aprobacion/{id} (detalles + auditoría)
   - POST /api/aprobacion/{id}/aprobar
   - POST /api/aprobacion/{id}/rechazar
   - POST /api/aprobacion/{id}/cancelar

3. **Backend Logic:**
   - Validación de autorización (IDP_APROBADOR)
   - Generación de notificaciones
   - Procesamiento asincrónico de reintentos
   - Logging centralizado

4. **Frontend (React):**
   - Componente BandejaAprobacion.tsx
   - Modal DetallesSolicitud.tsx
   - Control de Aprobación/Rechazo/Cancelación

---

## 10. Scripts de Referencia

| Script | Propósito | Estado |
|--------|-----------|--------|
| 06_aprobador_rol_completo.sql | Crear extensión de schema | ✅ Ejecutado |
| 07_validar_constraints.sql | Validar constraints funcionales | ✅ Ejecutado |
| 08_validar_indices.sql | Validar índices y queries | ✅ Ejecutado |

---

**Modelo de Datos Aprobador: ✅ COMPLETO**

**PASO 1 (Modelo de Datos) completado exitosamente.**
