# Limpieza de Archivos - PASO 2 Tarea 6

**Fecha:** 2026-09-18  
**Etapa:** Post-Tarea 6 - Cleanup y Documentación  
**Estado:** ✅ Completado

---

## Archivos Eliminados (Versiones Fallidas)

| Archivo | Razón | Estado |
|---------|-------|--------|
| `PASO2_TAREA6_EJECUTAR_TODO_FINAL.sql` | v1 fallida (errores de DDL) | ❌ Eliminado |
| `PASO2_TAREA6_EJECUTAR_TODO_v2.sql` | v2 fallida (PARAMETROS_JSON issue) | ❌ Eliminado |
| `PASO2_TAREA6_EJECUTAR_TODO_v3_FINAL.sql` | v3 fallida (COMPANIA FK, timestamps) | ❌ Eliminado |
| `PASO2_TAREA6_SP_REPROCESAR_SOLICITUD.sql` | SP individual (integrado en FINAL_CLEAN) | ❌ Eliminado |
| `PASO2_TAREA6_SP_REPROCESAR_SOLICITUD_v2.sql` | SP v2 redundante | ❌ Eliminado |
| `PASO2_TAREA6_TESTS.sql` | Tests individual (integrado en FINAL_CLEAN) | ❌ Eliminado |
| `DIAGNOSTICO_CONSTRAINS.sql` | Diagnóstico de troubleshooting | ❌ Eliminado |
| `DIAGNOSTICO_DDL_TAREA6.sql` | Diagnóstico de troubleshooting | ❌ Eliminado |
| `DIAGNOSTICO_SIMPLE.sql` | Diagnóstico de troubleshooting | ❌ Eliminado |
| `DIAGNOSTICO_SOLICITUD.sql` | Diagnóstico de troubleshooting | ❌ Eliminado |

---

## Archivos Mantenidos (Producción)

| Archivo | Propósito | Estado |
|---------|-----------|--------|
| `PASO2_TAREA6_FINAL_CLEAN.sql` | **SCRIPT OFICIAL** - SP + Tests + Validación integrados | ✅ MANTENER |
| `PASO2_TAREA5_SP_PROCESAR_REINTENTOS_v2.sql` | SP Tarea 5 (validado en producción) | ✅ MANTENER |
| `PASO2_TAREA5_TESTS.sql` | Tests Tarea 5 | ✅ MANTENER |
| `PASO2_TAREA5_EJECUTAR_TODO_FINAL.sql` | Ejecución integrada Tarea 5 | ✅ MANTENER |
| `REPORTE_FINAL_TAREA5.sql` | Reporte de validación Tarea 5 | ✅ MANTENER |
| `00_VALIDAR_MODELO_ACTUAL.sql` | **NUEVO** - Validación de modelo (previene errores futuros) | ✅ CREAR |

---

## Archivos Nuevos Creados

| Archivo | Ubicación | Propósito |
|---------|-----------|----------|
| `MODELO_DISCREPANCIAS_ENCONTRADAS.md` | `aidlc-docs/inception/reverse-engineering/` | Documentación de discrepancias halladas entre DDL y realidad |
| `00_VALIDAR_MODELO_ACTUAL.sql` | `backend/sql/portal/` | Script de validación del modelo (previene errores futuros) |
| `PASO2_LIMPIEZA_ARCHIVOS_TAREA6.md` | `aidlc-docs/construction/planes/` | Este documento |

---

## Estructura Final - Directorio `backend/sql/portal`

```
backend/sql/portal/
├── 00_VALIDAR_MODELO_ACTUAL.sql                    ← NUEVO: Ejecutar antes de cada tarea
├── 00_diagnostico.sql
├── 01_esquema_y_catalogos.sql
├── 02_usuarios_y_ambitos.sql
├── 03_solicitudes.sql
├── 04_aprobaciones_y_ejecucion.sql
├── 05_aprobador_columnas_y_tablas.sql
├── 05_carga_inicial_usuarios_pruebas.sql
├── 05_migracion_ambito_sin_lista.sql
├── 06_aprobador_rol_completo.sql
├── 07_validar_constraints.sql
├── 08_validar_indices.sql
├── CHECK_AUDITORIA_ACCION.sql
├── CHECK_REINTENTO_STRUCTURE.sql
├── CHECK_SCHEMA.sql
├── DEBUG_REINTENTOS_DETALLE.sql
├── PASO2_TAREA5_SP_PROCESAR_REINTENTOS_v2.sql     ← TAREA 5: SP válido
├── PASO2_TAREA5_TESTS.sql                          ← TAREA 5: Tests
├── PASO2_TAREA5_EJECUTAR_TODO_FINAL.sql            ← TAREA 5: Ejecución
├── REPORTE_FINAL_TAREA5.sql                        ← TAREA 5: Validación
├── PASO2_TAREA6_FINAL_CLEAN.sql                    ← TAREA 6: SP + Tests + Validación OFICIAL
├── sp_01_aprobar_solicitud.sql
├── sp_02_rechazar_solicitud.sql
├── sp_03_solicitar_cancelacion.sql
├── sp_04_decidir_cancelacion.sql
├── SP_GESTION_LISTAS_PRECIOS_FULL MODELO.sql
├── SP_GESTION_LISTAS_PRECIOS_PARCIAL MODELO.sql
└── test_sp_aprobacion.sql
```

---

## Cambios Clave Documentados

### 📋 Discrepancias Descubiertas

1. **SOLICITUD vs SOLICITUD_PRECIO** - Tabla renamed en BD real
2. **ES_ERROR_TRANSITORIO: TINYINT → CHAR(1)** - Tipo de dato distinto
3. **PARAMETROS_JSON: NOT NULL** - Columna requerida, no documentada
4. **TIPO_ERROR: Valores limitados** - connection_timeout, service_unavailable, other_transient, temporary_lock
5. **COMPANIA: Solo 4 valores válidos** - BEVAL, COFERSA, FEBECA, SILLACA (no INTELIX)
6. **CODIGO_SOLICITUD: UNIQUE INDEX** - Necesita valores únicos (timestamp)
7. **RESULTADO_EJECUCION: Longitud limitada** - VARCHAR ~10-15 chars
8. **INTENTOS_REINTENTO: Máximo 3** - CHECK constraint 0-3

### ✅ Soluciones Implementadas

- Script de validación de modelo (`00_VALIDAR_MODELO_ACTUAL.sql`) para ejecutar antes de cada tarea
- Documentación completa de discrepancias (`MODELO_DISCREPANCIAS_ENCONTRADAS.md`)
- SP actualizado con mapeos de valores correctos
- Tests con valores válidos y timestamps únicos

---

## Próximas Tareas

### ⚠️ Antes de Tarea 7 (FN_OBTENER_BANDEJA_APROBACION)

1. **EJECUTAR:** `00_VALIDAR_MODELO_ACTUAL.sql` para verificar modelo
2. **CONSULTAR:** `MODELO_DISCREPANCIAS_ENCONTRADAS.md` para recordar cambios
3. **USAR:** Valores correctos en FN_OBTENER_BANDEJA_APROBACION:
   - COMPANIA IN ('BEVAL', 'COFERSA', 'FEBECA', 'SILLACA')
   - ES_ERROR_TRANSITORIO = 'S' (no 1)
   - TIPO_ERROR IN ('connection_timeout', 'service_unavailable', 'other_transient', 'temporary_lock')

---

## Recomendación

Mantener en el workspace solo archivos de **producción validada**. Los diagnósticos se pueden recrear si se necesita troubleshooting futuro, pero no deben ocupar espacio en producción.

**Status:** ✅ Limpieza completada. Listo para Tarea 7.
