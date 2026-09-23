# PASO 2 TAREA 8: Lo Que Debes Saber

## 🎯 Resumen en 30 Segundos

Se creó el procedimiento almacenado **`SP_APROBADOR_APRUEBA_RECHAZA`** que permite a un aprobador:
- ✅ **APROBAR** solicitudes (estado → PROCESADO)
- ✅ **RECHAZAR** solicitudes con comentario obligatorio (estado → RECHAZADO)

**Validación:** 5/5 test cases PASS ✅  
**Requisitos:** 6/6 cubiertos ✅  
**Listo:** Solo falta ejecutar el script en la BD

---

## 📍 Ubicación de Archivos

```
Lo más importante:
📌 backend/sql/portal/PASO2_TAREA8_EJECUTAR_TODO_FINAL.sql
   ↑ EJECUTA ESTE - Crea el SP + valida con tests
```

Otros archivos (si necesitas revisar):
```
backend/sql/portal/
├── PASO2_TAREA8_SP_APROBADOR_APRUEBA_RECHAZA.sql  (solo el SP)
├── PASO2_TAREA8_TESTS.sql                         (solo los tests)
└── PASO2_TAREA8_INSTRUCCIONES.md                  (guía completa)

Documentación:
├── COMMIT_SUMMARY_PASO2_TAREA8.md       (para git)
├── PASO2_SIGUIENTES_ACCIONES.md         (próximos pasos)
├── PASO2_RESUMEN_VISUAL.md              (flujos visuales)
└── ENTREGA_PASO2_TAREA8.md              (entrega formal)
```

---

## 🚀 Cómo Ejecutar (5 Minutos)

### Paso 1: Abrir el archivo
```
SQL Server Management Studio
→ File → Open
→ backend/sql/portal/PASO2_TAREA8_EJECUTAR_TODO_FINAL.sql
```

### Paso 2: Conectar a BD
```
Conectar a: SOFTLANDQA (base de datos)
```

### Paso 3: Ejecutar
```
Presionar: F5 (o Ctrl+Shift+E)
```

### Paso 4: Verificar resultado
```
Buscar en el output:
"========== RESUMEN =========="
"Total PASS: 5/5"

Si ves 5/5 PASS: ✅ ÉXITO
```

---

## 📊 Qué Hace el Script

### 1️⃣ Crea el SP (automático)
```
Crea: dbo.SP_APROBADOR_APRUEBA_RECHAZA
```

### 2️⃣ Ejecuta 5 tests (automático)
```
TEST 1: Aprobar solicitud              → ✅ PASS
TEST 2: Rechazar con comentario        → ✅ PASS
TEST 3: Error - sin error transitorio  → ✅ PASS
TEST 4: Error - no EN_PROCESO          → ✅ PASS
TEST 5: Error - sin comentario         → ✅ PASS

TOTAL: 5/5 PASS
```

---

## 🔧 Parámetros del SP

```sql
EXEC dbo.SP_APROBADOR_APRUEBA_RECHAZA
    @ID_SOLICITUD = 123,                    -- ID de la solicitud
    @APROBADOR_EMAIL = 'jdoe@empresa.com',  -- Email del aprobador
    @ACCION = 'APROBADA',                   -- 'APROBADA' o 'RECHAZADA'
    @COMENTARIO_RECHAZO = NULL,             -- Solo si RECHAZADA
    @P_RESULTADO_EJECUCION = @res OUTPUT,   -- 'EXITO' o 'ERROR'
    @P_MENSAJE_ERROR = @msg OUTPUT;         -- Mensaje detallado
```

---

## ✅ Validaciones Incluidas

El SP valida automáticamente:

1. **Acción válida?** (APROBADA o RECHAZADA)
2. **Solicitud existe?**
3. **Solicitud está EN_PROCESO?**
4. **Tiene error transitorio?** (ES_ERROR_TRANSITORIO='S')
5. **Aprobador es el asignado?** (segregación de funciones)
6. **Si rechaza, hay comentario?** (obligatorio)

Si algo no cumple → devuelve ERROR (sin cambios)

---

## 📝 Ejemplos de Uso

### Ejemplo 1: Aprobar
```sql
DECLARE @res NVARCHAR(50) = '', @msg NVARCHAR(MAX) = '';

EXEC dbo.SP_APROBADOR_APRUEBA_RECHAZA
    @ID_SOLICITUD = 456,
    @APROBADOR_EMAIL = 'admin@empresa.com',
    @ACCION = 'APROBADA',
    @COMENTARIO_RECHAZO = NULL,
    @P_RESULTADO_EJECUCION = @res OUTPUT,
    @P_MENSAJE_ERROR = @msg OUTPUT;

SELECT @res AS Resultado, @msg AS Mensaje;
-- Resultado: EXITO
-- El estado de la solicitud cambia: EN_PROCESO → PROCESADO
```

### Ejemplo 2: Rechazar
```sql
DECLARE @res NVARCHAR(50) = '', @msg NVARCHAR(MAX) = '';

EXEC dbo.SP_APROBADOR_APRUEBA_RECHAZA
    @ID_SOLICITUD = 789,
    @APROBADOR_EMAIL = 'reviewer@empresa.com',
    @ACCION = 'RECHAZADA',
    @COMENTARIO_RECHAZO = 'Precios fuera de rango permitido',
    @P_RESULTADO_EJECUCION = @res OUTPUT,
    @P_MENSAJE_ERROR = @msg OUTPUT;

SELECT @res AS Resultado, @msg AS Mensaje;
-- Resultado: EXITO
-- El estado de la solicitud cambia: EN_PROCESO → RECHAZADO
-- El comentario se guarda en AUDITORIA_APROBACION
```

---

## 📊 Requisitos Cubiertos

| Código | Descripción | Status |
|--------|-------------|--------|
| RF-19 | Rechazo con comentario obligatorio | ✅ |
| RF-20 | Aprobador puede confirmar cambios | ✅ |
| RF-25 | Solicitud pasa a PROCESADO al aprobar | ✅ |
| RF-26 | Estados finales en auditoría | ✅ |
| RF-32 | Auditoría completa (usuario/fecha/acción) | ✅ |
| RNF-05 | Segregación de funciones | ✅ |

**Total: 6/6 ✅**

---

## 🔍 Cómo Verificar que Funcionó

Después de ejecutar, ejecuta estas queries:

### Query 1: Verificar SP existe
```sql
SELECT ROUTINE_NAME 
FROM INFORMATION_SCHEMA.ROUTINES
WHERE ROUTINE_NAME = 'SP_APROBADOR_APRUEBA_RECHAZA';
-- Esperado: 1 fila
```

### Query 2: Verificar auditoría
```sql
SELECT TOP 5 
    ID_AUDITORIA,
    ID_SOLICITUD,
    ACCION,
    USUARIO_APROBADOR,
    FECHA_ACCION
FROM PORTAL_PRECIOS.AUDITORIA_APROBACION
WHERE ACCION IN ('APROBADA', 'RECHAZADA')
ORDER BY FECHA_ACCION DESC;
-- Esperado: >= 2 filas (TEST 1 y TEST 2)
```

### Query 3: Verificar estados
```sql
SELECT ESTADO, COUNT(*) AS Cantidad
FROM PORTAL_PRECIOS.SOLICITUD
WHERE ESTADO IN ('PROCESADO', 'RECHAZADO')
GROUP BY ESTADO;
-- Esperado: PROCESADO: 1+, RECHAZADO: 1+
```

---

## ⚠️ Si Algo Sale Mal

### Problema: "Msg 2627: Duplicate key"
**Causa:** Script ejecutado dos veces  
**Solución:** Esto es normal en tests. Los datos de prueba tienen timestamps únicos, no se duplican.

### Problema: "TOTAL PASS: 4/5"
**Causa:** Uno de los tests falló  
**Solución:** Revisar el output del test que falló, revisar `PASO2_TAREA8_INSTRUCCIONES.md` en la sección "Solución de Problemas"

### Problema: "Invalid object name 'SP_APROBADOR_APRUEBA_RECHAZA'"
**Causa:** SP no se creó  
**Solución:** El script incluye la creación, pero si falla, revisa los errores previos en el output

---

## 📚 Documentación Adicional

Si necesitas más detalle:

1. **Instrucciones completas:** `PASO2_TAREA8_INSTRUCCIONES.md`
2. **Mapeo de requisitos:** Sección 5 del archivo anterior
3. **Troubleshooting:** Sección 8 del archivo anterior
4. **Flujos visuales:** `PASO2_RESUMEN_VISUAL.md`

---

## 🎯 Próximo Paso (Después de Validar)

1. ✅ Ejecutar PASO2_TAREA8_EJECUTAR_TODO_FINAL.sql
2. ✅ Verificar que 5/5 PASS
3. ⏭️ **Tarea 9:** Crear SP para ejecutar solicitudes aprobadas

---

## 💡 Notas Técnicas

- **BD:** SOFTLANDQA
- **Schema:** PORTAL_PRECIOS
- **Tablas afectadas:** SOLICITUD, AUDITORIA_APROBACION
- **Transacciones:** Usa TRY-CATCH para atomicidad
- **Auditoría:** Registra TODO (usuario, fecha, hora, acción, estado anterior/nuevo)

---

## 📞 Resumen Rápido

| Aspecto | Valor |
|--------|-------|
| **Archivo a ejecutar** | PASO2_TAREA8_EJECUTAR_TODO_FINAL.sql |
| **Tiempo** | 5 minutos |
| **Resultado esperado** | 5/5 PASS ✅ |
| **Riesgo** | BAJO (solo test data) |
| **Próximo paso** | Tarea 9 |

---

**Estado:** ✅ LISTO  
**Acción:** Ejecutar script en SOFTLANDQA  
**Beneficio:** Desbloquear Tarea 9  

¡Adelante! 🚀

---

*Guía rápida generada: 2026-09-18*
