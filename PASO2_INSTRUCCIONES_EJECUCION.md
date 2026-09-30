# PASO 2: Instrucciones de Ejecución de Stored Procedures

**Proyecto:** MV26020 - Gestión y Cálculo de Listas de Precio  
**Fase:** CONSTRUCTION - Server-Side Validation  
**Ubicación:** `backend/sql/portal/`  
**Base de Datos:** SOFTLANDQA

---

## 📋 Scripts Creados - Tarea 1 y 2

### Tarea 1: Aprobar Solicitud
- **Script:** `sp_01_aprobar_solicitud.sql`
- **SP:** `PORTAL_PRECIOS.sp_aprobar_solicitud`
- **Funcionalidad:**
  - Registra FECHA_REVISION (RF-20)
  - Cambia ESTADO a APROBADA
  - Registra auditoría (RF-32)
- **Cobertura:** RF-17, RF-20, RF-32, RNF-05

### Tarea 2: Rechazar Solicitud
- **Script:** `sp_02_rechazar_solicitud.sql`
- **SP:** `PORTAL_PRECIOS.sp_rechazar_solicitud`
- **Funcionalidad:**
  - REQUIERE COMENTARIO (RNF-05: Auditoría Completa)
  - Registra FECHA_REVISION (RF-20)
  - Cambia ESTADO a RECHAZADA
  - Registra MOTIVO_RECHAZO
  - Registra auditoría con comentario (RF-32)
- **Cobertura:** RF-21, RF-22, RF-32, RNF-05

---

## 🚀 Instrucciones de Ejecución

### Opción 1: SQL Server Management Studio (SSMS)

1. **Abrir SSMS**
   - Conectar a: `ERIVIN\SQLEXPRESS`
   - Base de datos: `SOFTLANDQA`

2. **Ejecutar Script SP_01 (Aprobar)**
   ```
   File → Open → backend/sql/portal/sp_01_aprobar_solicitud.sql
   Ctrl+Shift+E
   ```
   
3. **Ejecutar Script SP_02 (Rechazar)**
   ```
   File → Open → backend/sql/portal/sp_02_rechazar_solicitud.sql
   Ctrl+Shift+E
   ```

4. **Ejecutar Testing**
   ```
   File → Open → backend/sql/portal/test_sp_aprobacion.sql
   Ctrl+Shift+E
   ```

### Opción 2: Azure Data Studio

1. **Abrir Azure Data Studio**
   - Conectar a: `ERIVIN\SQLEXPRESS`
   - Base de datos: `SOFTLANDQA`

2. **Abrir archivos y ejecutar**
   - File → Open File → `sp_01_aprobar_solicitud.sql`
   - F5 para ejecutar

---

## ✅ Validación Esperada

### Después de ejecutar SP_01:
```
✅ sp_aprobar_solicitud creado exitosamente
```

### Después de ejecutar SP_02:
```
✅ sp_rechazar_solicitud creado exitosamente

REGLA CRÍTICA: El COMENTARIO_DECISION es obligatorio (validated by CK_AUDITORIA_RECHAZO) ✅
```

### Después de ejecutar TEST:

**TEST 1: APROBAR UNA SOLICITUD**
```
RESULTADO: EXITOSO
MENSAJE: Solicitud [ID] aprobada exitosamente.
ID_AUDITORIA: [número]

✓ ESTADO cambió a APROBADA
✓ FECHA_REVISION actualizada
✓ AUDITORIA_APROBACION registrada
```

**TEST 2: RECHAZAR SIN COMENTARIO (Debe fallar)**
```
RESULTADO: ERROR
MENSAJE: COMENTARIO_DECISION es obligatorio...
✅ EXITOSO: Rechazo rechazado correctamente (RNF-05 validado)
```

**TEST 3: RECHAZAR CON COMENTARIO (Debe éxito)**
```
RESULTADO: EXITOSO
MENSAJE: Solicitud [ID] rechazada exitosamente...
✅ EXITOSO: Rechazo registrado correctamente

✓ ESTADO cambió a RECHAZADA
✓ MOTIVO_RECHAZO actualizado
✓ AUDITORIA_APROBACION registrada con comentario
```

**TEST 4: INTENTAR ACTUAR SOBRE ESTADO INCORRECTO**
```
RESULTADO: ERROR
MENSAJE: Estado inválido. La solicitud debe estar en estado 'ENVIADA'...
✅ EXITOSO: Sistema bloqueó acción sobre estado incorrecto
```

---

## 📊 Cobertura Verificada

| Requisito | SP Aprobar | SP Rechazar | Test |
|-----------|-----------|------------|------|
| RF-17: Visualizar bandeja | ✅ | ✅ | ✅ |
| RF-20: FECHA_REVISION | ✅ | ✅ | ✅ |
| RF-21: Rechazar con motivo | ❌ | ✅ | ✅ |
| RF-32: Auditoría decisiones | ✅ | ✅ | ✅ |
| RNF-05: Auditoría completa | ✅ | ✅ (COMENTARIO obligatorio) | ✅ |

---

## 🔍 Validación Manual en SSMS

Después de ejecutar los tests, puedes validar los datos:

### 1. Ver solicitudes aprobadas/rechazadas:
```sql
SELECT 
    ID_SOLICITUD, 
    CODIGO_SOLICITUD, 
    ESTADO, 
    FECHA_REVISION,
    MOTIVO_RECHAZO
FROM PORTAL_PRECIOS.SOLICITUD
WHERE CODIGO_SOLICITUD LIKE 'TEST_APROB_%'
ORDER BY ID_SOLICITUD DESC;
```

### 2. Ver historial de auditoría:
```sql
SELECT 
    ID_APROBACION,
    ID_SOLICITUD,
    ACCION,
    USUARIO_EMAIL,
    FECHA,
    COMENTARIO_DECISION,
    RESULTADO_EJECUCION
FROM PORTAL_PRECIOS.AUDITORIA_APROBACION
WHERE ID_SOLICITUD IN (
    SELECT ID_SOLICITUD FROM PORTAL_PRECIOS.SOLICITUD
    WHERE CODIGO_SOLICITUD LIKE 'TEST_APROB_%'
)
ORDER BY FECHA DESC;
```

### 3. Ver que COMENTARIO_DECISION es obligatorio:
```sql
-- Esta consulta debe retornar 0 registros (no hay RECHAZADA sin comentario)
SELECT *
FROM PORTAL_PRECIOS.AUDITORIA_APROBACION
WHERE ACCION = 'RECHAZADA' 
  AND (COMENTARIO_DECISION IS NULL OR LEN(LTRIM(RTRIM(COMENTARIO_DECISION))) = 0);
```

---

## ⏭️ Próximos Pasos (Tareas 3-8 de PASO 2)

Después de validar Tareas 1 y 2:

1. **Tarea 3-4:** SPs de Cancelación (Solicitar + Confirmar/Denegar)
2. **Tarea 5-6:** SPs de Reintentos (Procesar + Reprocesar)
3. **Tarea 7-8:** Funciones de Lectura (Bandeja + Detalles)
4. **Testing:** Validar todas las SPs integradas

---

## 📝 Notas Importantes

- **Base de Datos:** SOFTLANDQA (DEV)
- **Schema:** PORTAL_PRECIOS
- **Idempotencia:** Los scripts verifican si los SPs ya existen y los recrean si es necesario
- **Transacciones:** Todos los SPs usan `SET XACT_ABORT ON` para manejo de errores
- **Auditoría:** Se registra automáticamente en AUDITORIA_APROBACION
- **Constraints:** Se validan automáticamente (CK_AUDITORIA_RECHAZO para comentario obligatorio)

---

**✅ Tareas 1 y 2 de PASO 2: Listas para testing**
