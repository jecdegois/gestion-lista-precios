# Scripts SQL de Producción — MV26020 Cálculo de Listas de Precio

**Última Actualización:** 2026-09-18  
**Estado:** ✅ Limpio para Commit — Estructura consolidada PASO 1 (01-08) + PASO 2 (T5-T8)

---

## 📋 Estructura de Archivos (Archivos de Producción Únicamente)

### PASO 1: Infraestructura Base (Scripts 01-08)
Ejecutar **una sola vez** en orden secuencial. Establecen el modelo de datos completo.

| Archivo | Propósito |
|---------|----------|
| `01_esquema_y_catalogos.sql` | Crear esquema PORTAL_PRECIOS y tablas COMPANIA/LISTA_PRECIO |
| `02_usuarios_y_ambitos.sql` | Crear usuarios del sistema y tabla USUARIO_AMBITO |
| `03_solicitudes.sql` | Crear tabla SOLICITUD y AUDITORIA_EVENTOS |
| `04_aprobaciones_y_ejecucion.sql` | Crear tablas AUDITORIA_EJECUCION y AUDITORIA_APROBACION |
| `05_aprobador_columnas_y_tablas.sql` | Agregar columnas de aprobador a SOLICITUD y crear SOLICITUD_REINTENTO |
| `05_carga_inicial_usuarios_pruebas.sql` | Cargar usuarios iniciales (operadores, aprobadores) |
| `05_migracion_ambito_sin_lista.sql` | Migrar ámbitos sin lista específica |
| `06_aprobador_rol_completo.sql` | Validar rol de Aprobador y extensión de schema |
| `07_validar_constraints.sql` | Validar constraints de integridad y lógica |
| `08_validar_indices.sql` | Validar índices y performance |

**Dependencias:** Ejecutar en orden (01 → 02 → ... → 08)  
**Frecuencia:** Una sola vez (setup inicial)

---

### PASO 2: Tareas Productivas (Un archivo FINAL por tarea)
Ejecutar **una sola vez cada uno**. Cada script incluye SP/Function + tests validados.

| Archivo | Tarea | SP/Function | Propósito | Tests |
|---------|-------|-------------|----------|-------|
| `PASO2_TAREA5_FINAL.sql` | 5 | `SP_PROCESAR_REINTENTOS` | Reprocesar solicitudes con error transitorio (backoff exponencial) | 4/4 PASS |
| `PASO2_TAREA6_FINAL.sql` | 6 | `SP_REPROCESAR_SOLICITUD` | Reabrir solicitudes rechazadas para re-aprobación | 4/4 PASS |
| `PASO2_TAREA7_FINAL.sql` | 7 | `FN_OBTENER_BANDEJA_APROBACION` | Query la bandeja de solicitudes en aprobación | N/A |
| `PASO2_TAREA8_FINAL.sql` | 8 | `SP_APROBADOR_APRUEBA_RECHAZA` | Aprobar/Rechazar solicitudes con auditoría | 5/5 PASS |

**Dependencias:** Ejecutar en orden (T5 → T6 → T7 → T8); cada uno depende de PASO 1  
**Frecuencia:** Una sola vez (setup de SPs y Functions)

---

## 🚀 Orden de Ejecución (Primera Vez)

```sql
-- PASO 1: Infraestructura base (01-08, una sola vez)
01_esquema_y_catalogos.sql
02_usuarios_y_ambitos.sql
03_solicitudes.sql
04_aprobaciones_y_ejecucion.sql
05_aprobador_columnas_y_tablas.sql
05_carga_inicial_usuarios_pruebas.sql
05_migracion_ambito_sin_lista.sql
06_aprobador_rol_completo.sql
07_validar_constraints.sql
08_validar_indices.sql

-- PASO 2: Tareas productivas (T5-T8, una sola vez cada una)
PASO2_TAREA5_FINAL.sql
PASO2_TAREA6_FINAL.sql
PASO2_TAREA7_FINAL.sql
PASO2_TAREA8_FINAL.sql
```

---

## 📊 Resumen de Objetos Creados

### PASO 1 (Infraestructura)
- **Esquema:** PORTAL_PRECIOS
- **Tablas:** 8 (COMPANIA, LISTA_PRECIO, USUARIO_AMBITO, SOLICITUD, AUDITORIA_EVENTOS, AUDITORIA_EJECUCION, AUDITORIA_APROBACION, SOLICITUD_REINTENTO)
- **Índices:** 6+ (optimizados para queries de aprobación)
- **Constraints:** 20+ (integridad de datos + lógica de negocio)

### PASO 2 (SPs y Functions)
- **Stored Procedures:** 3 (SP_PROCESAR_REINTENTOS, SP_REPROCESAR_SOLICITUD, SP_APROBADOR_APRUEBA_RECHAZA)
- **Functions:** 1 (FN_OBTENER_BANDEJA_APROBACION)
- **Auditoría:** Completa en cada operación (usuario, timestamp, acción, estado anterior/nuevo)

---

## ✅ Validaciones Completadas

| Componente | Tests | Resultado |
|-----------|-------|-----------|
| **PASO2_TAREA5_FINAL** | 4 cases | ✅ 4/4 PASS |
| **PASO2_TAREA6_FINAL** | 4 cases | ✅ 4/4 PASS |
| **PASO2_TAREA7_FINAL** | Query | ✅ Creada (sin test data) |
| **PASO2_TAREA8_FINAL** | 5 cases | ✅ 5/5 PASS en SOFTLANDQA |

---

## 🎯 Requisitos Cubiertos

| Requisito | Tarea | Estado |
|-----------|-------|--------|
| **RF-19** | T8 | ✅ Rechazo con comentario obligatorio |
| **RF-20** | T8 | ✅ Aprobador puede decidir |
| **RF-25** | T8 | ✅ PROCESADO al aprobar |
| **RF-26** | T8 | ✅ Estados finales auditados |
| **RF-29** | T5 | ✅ Reintentos automáticos |
| **RF-30** | T5 | ✅ Backoff exponencial |
| **RF-31** | T6 | ✅ Reproceso por aprobador |
| **RF-32** | T8 | ✅ Auditoría completa (usuario/fecha/acción) |
| **RF-33** | T7 | ✅ Bandeja de aprobación por aprobador |
| **RNF-05** | T8 | ✅ Segregación de funciones |

## 📝 Notas de Limpieza

**Archivos Mantidos en Producción (15):**
- PASO 1: 01-08 (infraestructura base, ejecutar una sola vez en orden)
- PASO 2: PASO2_TAREA5_FINAL.sql, PASO2_TAREA6_FINAL.sql, PASO2_TAREA7_FINAL.sql, PASO2_TAREA8_FINAL.sql (cada uno ejecutar una sola vez)
- Documentación: README_ARCHIVOS_PRODUCCION.md (este archivo)

**Archivos Eliminados (19):**
- Diagnósticos: 00_VALIDAR_MODELO_ACTUAL.sql, DIAGNOSTICO_AUDITORIA_APROBACION.sql, PASO2_TAREA7_DIAGNOSTICO.sql, PASO2_TAREA8_DIAGNOSTICO_COLUMNAS.sql
- Reportes: REPORTE_FINAL_TAREA5.sql
- SPs antiguos: sp_01_aprobar_solicitud.sql, sp_02_rechazar_solicitud.sql, sp_03_solicitar_cancelacion.sql, sp_04_decidir_cancelacion.sql
- Versiones previas: PASO2_TAREA8_SP_APROBADOR_APRUEBA_RECHAZA.sql, PASO2_TAREA5_SP_PROCESAR_REINTENTOS_v2.sql
- Tests individuales: PASO2_TAREA8_TESTS.sql, PASO2_TAREA5_TESTS.sql, test_sp_aprobacion.sql
- Borradores: SP_GESTION_LISTAS_PRECIOS_FULL MODELO.sql, SP_GESTION_LISTAS_PRECIOS_PARCIAL MODELO.sql
- Documentación antigua: PASO2_TAREA7_INSTRUCCIONES.md, PASO2_TAREA8_CORRECCION_ESQUEMA.md, PASO2_TAREA8_CORRECCIONES_APLICADAS.md
- Utilitarios: PASO2_TAREA8_LIMPIAR_DATOS_TEST.sql

**Razón:** Solo archivos de producción (setup + tareas) son necesarios. Eliminados diagnósticos, versiones antiguas, tests intermedios y documentación de debugging.

---

## 🔗 Próximo Paso

**PASO 2 Tarea 9:** SP para ejecutar solicitudes aprobadas (`SP_EJECUTAR_SOLICITUD_APROBADA`)  
- Aplicar cambios de precio en ARTICULO_PRECIO
- Registrar auditoría de ejecución
- Manejar errores de ejecución y reintentos

---

**Estado:** Listo para commit ✅
