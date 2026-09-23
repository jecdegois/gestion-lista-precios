# 📊 SCHEMA REAL - SOFTLANDQA (Validado 2026-09-18 14:32 UTC)

**PROYECTO:** MV26020 - Cálculo de Listas de Precio  
**VALIDADO EN:** SOFTLANDQA BD viva  
**ESTADO:** ✅ SCHEMA REAL CONFIRMADO - NO ASUMIR DDL CONCEPTUAL

---

## Tabla 1: PORTAL_PRECIOS.SOLICITUD (Encabezado)

**Función:** Almacena solicitudes de cambios de precio (una por cambio)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| **ID_SOLICITUD** | INT | PK, IDENTITY |
| **TIPO_PROCESO** | VARCHAR | FACTOR_PRECIO, MAYOREOD_MASIVO, DESCUENTO_LISTA_PRECIO, MARGEN_UTILIDAD_MASIVO |
| **PROCESO** | VARCHAR | (Alternativo o secundario) |
| **COMPANIA** | VARCHAR(20) | |
| **LISTA_PRECIO** | VARCHAR | Lista objetivo |
| **IDP_OPERADOR** | INT | Operador que ejecuta |
| **IDP_APROBADOR** | INT | Aprobador |
| **ESTADO** | VARCHAR | BORRADOR, PENDIENTE, EN_PROCESO, PROCESADO, PROCESADO_CON_ERRORES, ERROR_EJECUCION, RECHAZADO, CANCELADO |
| **MOTIVO_RECHAZO** | VARCHAR | Si fue rechazada |
| **PARAMETROS_JSON** | NVARCHAR(MAX) | JSON con parámetros |
| **INTENTOS_REINTENTO** | INT | Contador reintentos (máx 3) |
| **FECHA_CREACION** | DATETIME | |
| **FECHA_MODIFICACION** | DATETIME | |
| **FECHA_ENVIO** | DATETIME | |
| **ARCHIVO_S3_KEY** | VARCHAR | Clave S3 |
| **ARCHIVO_NOMBRE** | VARCHAR | |
| **SOLICITANTE_NOMBRE** | VARCHAR | |
| **SOLICITANTE_EMAIL** | VARCHAR | Email solicitante |
| **CODIGO_SOLICITUD** | VARCHAR | Código único (SOL-XXXXX) |
| **MODALIDAD** | VARCHAR | manual / excel |
| **FECHA_ULT_ESTADO** | DATETIME | Último cambio de estado |
| **ID_PROCESO_SP** | VARCHAR | ID del proceso ejecutado |
| **APROBADOR_EMAIL** | VARCHAR | Email aprobador |
| **APROBADOR_NOMBRE** | VARCHAR | |
| **TOTAL_REGISTROS** | INT | Total detalles procesados |
| **EXITOSOS** | INT | Detalles OK |
| **FALLIDOS** | INT | Detalles ERROR |
| **LOG_S3_KEY** | VARCHAR | Clave log S3 |
| **ID_USUARIO_SOLICITANTE** | INT | |
| **CAUSA** | VARCHAR | Causa general |
| **ES_ERROR_TRANSITORIO** | CHAR(1) | 'S' / 'N' |
| **CODIGO_ERROR** | VARCHAR | |
| **MENSAJE_ERROR** | VARCHAR | |
| **FECHA_REVISION** | DATETIME | |
| **FECHA_INICIO_EJECUCION** | DATETIME | |
| **FECHA_FIN_EJECUCION** | DATETIME | |
| **CANCELACION_SOLICITADA** | CHAR(1) | 'S' / 'N' |
| **FECHA_SOLICITUD_CANCELACION** | DATETIME | |
| **USUARIO_SOLICITA_CANCELACION** | VARCHAR | |
| **CANCELACION_CONFIRMADA** | CHAR(1) | 'S' / 'N' |
| **FECHA_CANCELACION** | DATETIME | |
| **USUARIO_DECIDE_CANCELACION** | VARCHAR | |

---

## Tabla 2: PORTAL_PRECIOS.SOLICITUD_DETALLE (Líneas/Artículos)

**Función:** Almacena detalles línea por línea (N:1 con SOLICITUD)  
**Cardinalidad:** Muchos detalles por una solicitud

| Columna | Tipo | Descripción |
|---------|------|-------------|
| **ID_DETALLE** | INT | PK, IDENTITY |
| **ID_SOLICITUD** | INT | FK → SOLICITUD.ID_SOLICITUD |
| **SKU** | VARCHAR | Código de artículo |
| **DESCRIPCION** | VARCHAR | Descripción artículo |
| **PRECIO_ACTUAL** | DECIMAL | Precio vigente |
| **COSTO** | DECIMAL | Costo del artículo |
| **FACTOR_APLICADO** | DECIMAL | ✅ **Factor multiplicador aplicado a ESTA línea** |
| **PRECIO_SIMULADO** | DECIMAL | Precio después de aplicar FACTOR_APLICADO |
| **PORCENTAJE_MARGEN** | DECIMAL | Margen resultante |
| **ESTADO_FILA** | VARCHAR | OK / ERROR / NO_APLICADO |
| **MENSAJE_ERROR** | VARCHAR | Error si ESTADO_FILA = ERROR |
| **CAUSA** | VARCHAR | Causa del error |
| **FACTOR_SOLICITADO** | DECIMAL | Factor original solicitado |
| **LISTA_PRECIO** | VARCHAR | Lista para esta línea |

---

## Lógica de Ejecución

### SP_EJECUTAR_SOLICITUD_APROBADA (Pseudocódigo)

```sql
-- 1. Leer SOLICITUD (encabezado)
SELECT @ESTADO, @TIPO_PROCESO, @APROBADOR_EMAIL, ...
FROM PORTAL_PRECIOS.SOLICITUD
WHERE ID_SOLICITUD = @ID_SOLICITUD

-- 2. Validar ESTADO = PENDIENTE y segregación

-- 3. Cambiar SOLICITUD.ESTADO → EN_PROCESO

-- 4. Iterar SOLICITUD_DETALLE (línea por línea)
DECLARE @TOTAL INT = 0, @EXITOSOS INT = 0, @FALLIDOS INT = 0

SELECT @SKU, @PRECIO_ACTUAL, @FACTOR_APLICADO, ...
FROM PORTAL_PRECIOS.SOLICITUD_DETALLE
WHERE ID_SOLICITUD = @ID_SOLICITUD

-- 5. Para cada detalle: aplicar FACTOR_APLICADO
   IF @TIPO_PROCESO = 'FACTOR_PRECIO'
   BEGIN
       @PRECIO_NUEVO = @PRECIO_ACTUAL * @FACTOR_APLICADO
       @MARGEN = (@PRECIO_NUEVO - @COSTO) / @PRECIO_NUEVO
       @ESTADO_FILA = 'OK'
   END

-- 6. Actualizar SOLICITUD_DETALLE
   UPDATE SOLICITUD_DETALLE
   SET PRECIO_SIMULADO = @PRECIO_NUEVO,
       PORCENTAJE_MARGEN = @MARGEN,
       ESTADO_FILA = @ESTADO_FILA
   WHERE ID_DETALLE = @ID_DETALLE

-- 7. Contar resultados
   IF @ESTADO_FILA = 'OK' 
       @EXITOSOS += 1
   ELSE 
       @FALLIDOS += 1

-- 8. Actualizar SOLICITUD (encabezado)
   UPDATE SOLICITUD
   SET ESTADO = CASE WHEN @FALLIDOS = 0 THEN 'PROCESADO' 
                      WHEN @EXITOSOS > 0 AND @FALLIDOS > 0 THEN 'PROCESADO_CON_ERRORES'
                      ELSE 'ERROR_EJECUCION' END,
       TOTAL_REGISTROS = @TOTAL,
       EXITOSOS = @EXITOSOS,
       FALLIDOS = @FALLIDOS,
       FECHA_FIN_EJECUCION = GETDATE()
   WHERE ID_SOLICITUD = @ID_SOLICITUD
```

---

## REGLA DE ORO

```
┌─────────────────────────────────────────────────────────────────┐
│ NUNCA confíes en el DDL conceptual (03_solicitudes.sql)        │
│                                                                  │
│ SIEMPRE valida CONTRA BD VIVA (SOFTLANDQA):                    │
│  1. Nombre tabla real                                           │
│  2. Columnas reales                                             │
│  3. Tipos de datos reales                                       │
│  4. Relaciones FK reales                                        │
│  5. CHECK constraints reales                                    │
│                                                                  │
│ USUARIO VALIDA EN BD → DOCUMENTACIÓN SE ACTUALIZA              │
│ DOCUMENTACIÓN → SCRIPTS SE REESCRIBEN                          │
│ SCRIPTS SE EJECUTAN EN BD                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Resumen de Errores por Iteración

| Iteración | Error | Causa | Solución |
|-----------|-------|-------|----------|
| 1 | Msg 208: Invalid object 'SOLICITUD_PRECIO' | Asumir DDL | Usar SOLICITUD real |
| 2 | Msg 207: Invalid column 'FACTOR_APLICADO' en SOLICITUD | Lógica incompleta | FACTOR_APLICADO está en SOLICITUD_DETALLE |
| 3 | Columnas inconsistentes (LISTA, LISTA_PRECIO, etc.) | DDL desactualizado | Validar contra BD viva |
| 4 | **SCHEMA REAL CONFIRMADO** | ✅ Usuario valida directamente | Usar referencias validadas |

---

**Última Actualización:** 2026-09-18 14:32 UTC  
**Validado por:** Usuario en SOFTLANDQA (BD viva)  
**Estado:** ✅ DEFINITIVO - SCHEMA REAL
