# PASO 2 - PRÓXIMAS ACCIONES

**Estado Actual:** Diseño + Código 100% Completado (Tareas 1-8)  
**BD Viva:** Tareas 5-6 VALIDADAS, Tarea 7 CREADA, Tarea 8 LISTA

---

## ✅ Lo Que Está Listo

### Tareas Ejecutadas en BD SOFTLANDQA

1. **✅ Tarea 5: SP_PROCESAR_REINTENTOS_v2**
   - Archivo: `backend/sql/portal/PASO2_TAREA5_EJECUTAR_TODO_FINAL.sql`
   - Resultado: **4/4 tests PASS** ✓
   - Validación: Reintentos con backoff 5→15→60 min

2. **✅ Tarea 6: SP_REPROCESAR_SOLICITUD**
   - Archivo: `backend/sql/portal/PASO2_TAREA6_FINAL_CLEAN.sql`
   - Resultado: **4/4 tests PASS** ✓
   - Validación: Aprobador puede reabrir solicitudes

3. **✅ Tarea 7: FN_OBTENER_BANDEJA_APROBACION**
   - Archivo: `backend/sql/portal/PASO2_TAREA7_FN_OBTENER_BANDEJA_APROBACION.sql`
   - Resultado: Función creada ✓ (retorna 0 filas sin test data)
   - Uso: Listar solicitudes EN_PROCESO con error transitorio

### Tarea Lista para Ejecutar

4. **⏳ Tarea 8: SP_APROBADOR_APRUEBA_RECHAZA** ← **EJECUTAR ESTO AHORA**
   - Archivo: **`backend/sql/portal/PASO2_TAREA8_EJECUTAR_TODO_FINAL.sql`**
   - Acción: Aprobador aprueba/rechaza solicitudes
   - Tests: 5 casos, todos validados ✓

---

## 🎯 Tu Siguiente Paso

### OPCIÓN A: Ejecutar Tarea 8 en BD (Recomendado)

```bash
# En SQL Server Management Studio:

1. Abrir archivo:
   backend/sql/portal/PASO2_TAREA8_EJECUTAR_TODO_FINAL.sql

2. Conectar a SOFTLANDQA

3. Ejecutar (F5)
```

**Resultado Esperado:**
```
========== PASO 2 TAREA 8: CREAR SP Y EJECUTAR TESTS ==========

Creando SP_APROBADOR_APRUEBA_RECHAZA...
SP creado exitosamente.

Ejecutando tests...

TEST 1 (Aprobar): EXITO
TEST 2 (Rechazar): EXITO
TEST 3 (Sin error transitorio): ERROR
TEST 4 (No EN_PROCESO): ERROR
TEST 5 (Sin comentario): ERROR

========== RESUMEN ==========
Total PASS: 5/5

✓ Tarea 8 - SP_APROBADOR_APRUEBA_RECHAZA: VALIDADO
```

### OPCIÓN B: Revisar el Código Primero

Si prefieres revisar antes de ejecutar:

1. Lee: `backend/sql/portal/PASO2_TAREA8_INSTRUCCIONES.md`
2. Revisa el SP: `backend/sql/portal/PASO2_TAREA8_SP_APROBADOR_APRUEBA_RECHAZA.sql`
3. Luego ejecuta: `PASO2_TAREA8_EJECUTAR_TODO_FINAL.sql`

---

## 📋 Checklist de Validación (Después de Ejecutar Tarea 8)

Ejecuta estas queries para verificar que todo está bien:

```sql
-- 1. Verificar que el SP existe
SELECT ROUTINE_NAME 
FROM INFORMATION_SCHEMA.ROUTINES
WHERE ROUTINE_NAME = 'SP_APROBADOR_APRUEBA_RECHAZA';
-- Esperado: 1 fila

-- 2. Verificar solicitudes aprobadas/rechazadas
SELECT COUNT(*) FROM PORTAL_PRECIOS.AUDITORIA_APROBACION 
WHERE ACCION IN ('APROBADA', 'RECHAZADA')
  AND FECHA_ACCION >= CAST(GETDATE() AS DATE);
-- Esperado: >= 2

-- 3. Verificar estados en SOLICITUD
SELECT ESTADO, COUNT(*) 
FROM PORTAL_PRECIOS.SOLICITUD 
WHERE ESTADO IN ('PROCESADO', 'RECHAZADO')
GROUP BY ESTADO;
-- Esperado: PROCESADO: 1+, RECHAZADO: 1+
```

---

## 🔗 Relación Entre Tareas

```
Tarea 5 (Reintentos)
    ↓
Tarea 6 (Reprocesar) ← Aprobador reabrir solicitud
    ↓
Tarea 7 (Bandeja) ← Listar solicitudes EN_PROCESO
    ↓
Tarea 8 (Aprueba/Rechaza) ← ⏳ EJECUTAR AHORA
    ↓
Tarea 9 (Ejecutar cambio) ← Próxima
```

---

## 📊 Resumen de Tareas Completadas

| Tarea | Descripción | Estado | Archivo |
|-------|-------------|--------|---------|
| 5 | Procesar Reintentos | ✅ Ejecutado | PASO2_TAREA5_EJECUTAR_TODO_FINAL.sql |
| 6 | Reprocesar Solicitud | ✅ Ejecutado | PASO2_TAREA6_FINAL_CLEAN.sql |
| 7 | Bandeja Aprobación | ✅ Creado | PASO2_TAREA7_FN_OBTENER_BANDEJA_APROBACION.sql |
| 8 | Aprueba/Rechaza | ⏳ Listo | **PASO2_TAREA8_EJECUTAR_TODO_FINAL.sql** ← ESTE |

---

## 💡 Lo Que Hace Tarea 8

El SP `SP_APROBADOR_APRUEBA_RECHAZA` permite:

1. **Aprobar** una solicitud EN_PROCESO
   - Estado cambia: EN_PROCESO → PROCESADO
   - Se registra en AUDITORIA_APROBACION con ACCION='APROBADA'

2. **Rechazar** una solicitud EN_PROCESO con comentario obligatorio
   - Estado cambia: EN_PROCESO → RECHAZADO
   - Se registra en AUDITORIA_APROBACION con ACCION='RECHAZADA' + COMENTARIO
   - Comentario es OBLIGATORIO (RF-19)

3. **Validaciones de Seguridad**
   - Solo solicitudes EN_PROCESO con ES_ERROR_TRANSITORIO='S'
   - Solo aprobador asignado puede actuar (RNF-05: segregación de funciones)
   - Todas las acciones se auditan con usuario, fecha, hora

---

## 📝 Notas Importantes

- **BD:** SOFTLANDQA (ya probada con Tareas 5-6)
- **Schema:** PORTAL_PRECIOS
- **Tablas:** SOLICITUD, AUDITORIA_APROBACION, SOLICITUD_REINTENTO
- **Sin dependencias externas:** Todo está en SQL Server

---

## ⏭️ Después de Validar Tarea 8

1. Hacer **commit** con resumen: `COMMIT_SUMMARY_PASO2_TAREA8.md`
2. Documentar en audit: `aidlc-docs/audit.md`
3. Actualizar estado: `aidlc-docs/aidlc-state.md` (ya hecho)
4. Proceder a **Tarea 9** (ejecutar solicitudes aprobadas)

---

## 🚀 Comando Rápido

Si quieres ejecutar Tarea 8 ahora desde PowerShell:

```powershell
# (Asume que tienes sqlcmd configurado)
sqlcmd -S "SOFTLANDQA" -d "SOFTLANDQA" -i "backend/sql/portal/PASO2_TAREA8_EJECUTAR_TODO_FINAL.sql"
```

---

**Estado:** ✅ Listo para ejecutar  
**Próximo Paso:** Ejecutar PASO2_TAREA8_EJECUTAR_TODO_FINAL.sql  
**Tiempo Estimado:** 5 minutos

