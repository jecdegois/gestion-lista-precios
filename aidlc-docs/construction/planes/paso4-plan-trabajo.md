# PASO 4: Integración Real de SPs Softland en el Flujo de Aprobación

**Proyecto:** MV26020 - Gestión y Cálculo de Listas de Precio  
**Fase:** CONSTRUCTION - Integración Softland  
**Objetivo:** Conectar el flujo de aprobación de la aplicación Next.js con los Stored Procedures ya validados en SOFTLANDQA, reemplazando la simulación demo por ejecución real.  
**Fecha Creación:** 2026-09-18  
**Stack:** Next.js 14 + TypeScript + SQL Server (mssql driver)  

---

## Contexto y Diagnóstico

### Situación Actual

El flujo maker-checker de la aplicación está completamente implementado en UI y lógica de negocio. El único bloqueante es un **guard hardcoded** en `app-web/src/server/companies.ts`:

```typescript
export function esEjecucionSoftlandBloqueada(): boolean {
  return true; // siempre bloquea — no es configurable
}
```

Cuando el Aprobador hace clic en "Aprobar", el flujo actual ejecuta una **simulación demo** (`setTimeout 6 segundos`) en lugar de llamar los SPs reales. Los SPs existen y están validados en SOFTLANDQA:

| SP / Function | Archivo SQL | Tests en BD |
|---|---|---|
| `SP_APROBADOR_APRUEBA_RECHAZA` | `PASO2_TAREA8_EJECUTAR_TODO_FINAL.sql` | 5/5 PASS |
| `SP_EJECUTAR_SOLICITUD_APROBADA` | `PASO2_TAREA9_FINAL.sql` | 5/5 PASS |
| `FN_OBTENER_BANDEJA_APROBACION` | `PASO2_TAREA7_FN_OBTENER_BANDEJA_APROBACION.sql` | N/A |

### Archivos a Modificar

| Archivo | Tipo de Cambio |
|---|---|
| `app-web/src/server/companies.ts` | Hacer `esEjecucionSoftlandBloqueada()` configurable vía env var |
| `app-web/src/server/portal-repository.ts` | Agregar `ejecutarSpAprobacion()` y `ejecutarSpSolicitudAprobada()` |
| `app-web/src/app/actions.ts` | Reemplazar `simularProcesamientoDemo()` por llamada real |
| `app-web/.env` | Agregar variable `SOFTLAND_EXECUTION_ENABLED=false` (opt-in) |

---

## Tareas del PASO 4

---

### Tarea 1: Desbloquear la Guardia de Ejecución Softland

**Archivo:** `app-web/src/server/companies.ts`  
**Estimado:** 30 min  
**Riesgo:** Bajo (solo cambia configurabilidad, no comportamiento por defecto)

**Qué hacer:**

Cambiar `esEjecucionSoftlandBloqueada()` de hardcoded `true` a controlada por variable de entorno. El **default debe ser bloqueado** (`true`) para no romper entornos donde la variable no está definida.

```typescript
// ANTES:
export function esEjecucionSoftlandBloqueada(): boolean {
  return true;
}

// DESPUÉS:
export function esEjecucionSoftlandBloqueada(): boolean {
  // Default: bloqueado. Solo se habilita con SOFTLAND_EXECUTION_ENABLED=true
  return (process.env.SOFTLAND_EXECUTION_ENABLED ?? "false").trim().toLowerCase() !== "true";
}
```

**También agregar en `.env`:**
```env
# Habilita la ejecución real de SPs en Softland al aprobar solicitudes.
# Default: false (bloqueado). Cambiar a true solo en entorno productivo autorizado.
SOFTLAND_EXECUTION_ENABLED=false
```

**Criterio de éxito:** Con `SOFTLAND_EXECUTION_ENABLED=false` (o variable ausente), la guardia bloquea exactamente como antes. Con `true`, permite pasar a los SPs.

**Status:** ⏳ Pendiente

---

### Tarea 2: Crear Repositorio de Aprobación Softland

**Archivo nuevo:** `app-web/src/server/approval-repository.ts`  
**Estimado:** 2h  
**Riesgo:** Medio (primera llamada real a SPs de escritura en Softland)

**Qué hacer:**

Crear un nuevo módulo de repositorio (separado de `portal-repository.ts` que solo toca `PORTAL_PRECIOS`) responsable de llamar los SPs de Softland al momento de ejecutar una solicitud aprobada.

**Funciones a implementar:**

#### 2.1 `ejecutarSpAprobadorAprueba()`

Llama a `SP_APROBADOR_APRUEBA_RECHAZA` en Softland.

```typescript
export interface ResultadoAprobacionSP {
  ok: boolean;
  error?: string;
  idProcesoSP?: string;
}

export async function ejecutarSpAprobadorAprueba(params: {
  idSolicitud: number;        // ID numérico de SOLICITUD en PORTAL_PRECIOS
  aprobadorEmail: string;
  accion: "APROBADA" | "RECHAZADA";
  comentarioRechazo?: string;
  compania: string;
}): Promise<ResultadoAprobacionSP>
```

Firma del SP a llamar:
```sql
EXEC SP_APROBADOR_APRUEBA_RECHAZA
  @ID_SOLICITUD       = ?,
  @APROBADOR_EMAIL    = ?,
  @ACCION             = ?,        -- 'APROBADA' | 'RECHAZADA'
  @COMENTARIO_RECHAZO = ?         -- NULL si es aprobación
```

#### 2.2 `ejecutarSpSolicitudAprobada()`

Llama a `SP_EJECUTAR_SOLICITUD_APROBADA` en Softland para ejecutar el proceso real (FACTOR_PRECIO, MAYOREOD_MASIVO, etc.).

```typescript
export interface ResultadoEjecucionSP {
  estado: "PROCESADO" | "PROCESADO_CON_ERRORES" | "ERROR_EJECUCION";
  totalLote: number;
  exitosos: number;
  fallidos: number;
  error?: string;
}

export async function ejecutarSpSolicitudAprobada(params: {
  idSolicitud: number;
  operadorEmail: string;
  compania: string;
}): Promise<ResultadoEjecucionSP>
```

Firma del SP a llamar:
```sql
EXEC SP_EJECUTAR_SOLICITUD_APROBADA
  @ID_SOLICITUD   = ?,
  @OPERADOR_EMAIL = ?
```

**Notas importantes:**
- Usar `getPortalPool()` existente (mismo servidor, distinto esquema)
- Envolver en try/catch — si el SP lanza excepción, capturar y retornar `estado: "ERROR_EJECUCION"`
- El SP ya maneja transacciones internamente; no wrappear en transacción externa
- Respetar `assertEscrituraSoftlandHabilitada()` al inicio de cada función

**Criterio de éxito:** Las funciones ejecutan los SPs sin errores en entorno de prueba con `SOFTLAND_EXECUTION_ENABLED=true` y datos de prueba en SOFTLANDQA.

**Status:** ⏳ Pendiente

---

### Tarea 3: Conectar el Flujo de Aprobación en `actions.ts`

**Archivo:** `app-web/src/app/actions.ts`  
**Estimado:** 2h  
**Riesgo:** Alto (cambio en el flujo principal de aprobación — requiere prueba exhaustiva)

**Qué hacer:**

Reemplazar `simularProcesamientoDemo()` por la ejecución real de SPs cuando Softland está habilitado. Mantener el modo demo como fallback cuando está bloqueado.

**Lógica propuesta para `aprobarSolicitud()`:**

```
1. Validaciones previas (iguales que hoy: estado PENDIENTE, segregación, rol, ámbito)
2. Cambiar estado a EN_PROCESO en portal BD (igual que hoy)
3. Registrar evento EJECUCION_ENCOLADA (igual que hoy)
4. SI esEjecucionSoftlandBloqueada():
     → lanzar simularProcesamientoDemo() [modo demo, sin cambios]
   SI NO:
     → lanzar ejecutarAprobacionReal() en background (fire-and-forget con void)
5. Retornar { ok: true, idProcesoSP }
```

**Nueva función `ejecutarAprobacionReal()`:**

```
1. Llamar ejecutarSpAprobadorAprueba(idSolicitud, aprobadorEmail, "APROBADA")
   → Si falla: marcar solicitud como ERROR_EJECUCION, registrar evento, return
2. Llamar ejecutarSpSolicitudAprobada(idSolicitud, aprobadorEmail)
   → Leer resultado: { estado, totalLote, exitosos, fallidos }
3. Actualizar solicitud en portal BD con estado y resultado reales
4. Registrar evento EJECUCION_FINALIZADA con datos reales
```

**Cambio en `rechazarSolicitud()`:**

El rechazo actual solo actualiza el portal BD (estado RECHAZADO). Agregar llamada a `SP_APROBADOR_APRUEBA_RECHAZA` con `@ACCION = 'RECHAZADA'` cuando Softland está habilitado, para mantener consistencia entre el portal y el esquema de SOFTLANDQA.

```
1. Validaciones (motivo obligatorio — igual que hoy)
2. SI NO esEjecucionSoftlandBloqueada():
     → Llamar ejecutarSpAprobadorAprueba(id, email, "RECHAZADA", motivo)
3. Actualizar estado en portal BD (igual que hoy)
4. Registrar evento SOLICITUD_RECHAZADA (igual que hoy)
```

**Criterio de éxito:** Con `SOFTLAND_EXECUTION_ENABLED=false`, el comportamiento es idéntico al actual. Con `true`, el SP se ejecuta y el estado final refleja el resultado real.

**Status:** ⏳ Pendiente

---

### Tarea 4: Obtener `ID_SOLICITUD` Numérico en el Flujo de Aprobación

**Archivo:** `app-web/src/server/portal-repository.ts`  
**Estimado:** 45 min  
**Riesgo:** Bajo

**Contexto:**

Los SPs de Softland reciben `@ID_SOLICITUD` (INT, clave primaria numérica de `PORTAL_PRECIOS.SOLICITUD`), pero la aplicación trabaja con `CODIGO_SOLICITUD` (string, ej. `"SOL-10451"`).

La función `actualizarSolicitud()` ya recibe el código string y hace `WHERE CODIGO_SOLICITUD = @cod`. Para llamar los SPs, se necesita el `ID_SOLICITUD` numérico.

**Qué hacer:**

Agregar función `obtenerIdNumericoSolicitud(codigoSolicitud: string): Promise<number>` en `portal-repository.ts`:

```typescript
export async function obtenerIdNumericoSolicitud(codigo: string): Promise<number> {
  if (esModoDemo()) {
    // en demo no hay IDs numéricos reales; retornar 0 o -1 (no se usará)
    return 0;
  }
  const pool = await getPortalPool();
  const mssql = await import("mssql");
  const r = await pool
    .request()
    .input("cod", mssql.VarChar(20), codigo)
    .query(`SELECT ID_SOLICITUD FROM ${objetoPortal("SOLICITUD")} WHERE CODIGO_SOLICITUD = @cod`);
  const row = r.recordset[0];
  if (!row) throw new Error(`Solicitud '${codigo}' no encontrada en portal.`);
  return Number(row.ID_SOLICITUD);
}
```

**Criterio de éxito:** La función retorna el ID numérico correcto dado un código `SOL-XXXX`.

**Status:** ⏳ Pendiente

---

### Tarea 5: Pruebas de Integración End-to-End

**Estimado:** 2h  
**Riesgo:** Bajo (solo lectura de resultados para validar)

**Entorno:** SOFTLANDQA con `SOFTLAND_EXECUTION_ENABLED=true`

**Escenarios a probar:**

| # | Escenario | Resultado Esperado |
|---|---|---|
| T1 | Aprobador aprueba solicitud FACTOR_PRECIO válida | Estado → PROCESADO, auditoría registrada |
| T2 | Aprobador aprueba solicitud MARGEN_UTILIDAD válida | Estado → PROCESADO |
| T3 | Aprobador aprueba solicitud con artículos con error | Estado → PROCESADO_CON_ERRORES, fallidos > 0 |
| T4 | Aprobador rechaza solicitud con motivo | Estado → RECHAZADO, SP registra motivo |
| T5 | Operador intenta aprobar su propia solicitud | Error UI: "No puede aprobar su propia solicitud" |
| T6 | Con `SOFTLAND_EXECUTION_ENABLED=false` (default) | Comportamiento demo sin cambios |
| T7 | SP falla (ID inválido, error de BD) | Estado → ERROR_EJECUCION, error capturado, no crash |

**Procedimiento:**
1. Encender app con `SOFTLAND_EXECUTION_ENABLED=true` apuntando a SOFTLANDQA
2. Crear solicitud de prueba como OPERADOR
3. Iniciar sesión como APROBADOR (email distinto)
4. Aprobar/rechazar y verificar: estado en la app, registros en `PORTAL_PRECIOS.SOLICITUD`, registros en `PORTAL_PRECIOS.AUDITORIA_PRECIOS`, efecto real en tablas Softland (ARTICULO_PRECIO, NIVEL_PRECIO)
5. Repetir con `SOFTLAND_EXECUTION_ENABLED=false` y confirmar modo demo intacto

**Status:** ⏳ Pendiente

---

## Resumen y Timeline

| Tarea | Descripción | Horas Est. | Riesgo | Status |
|-------|-------------|-----------|--------|--------|
| 1 | Desbloquear guardia (env var) | 0.5h | Bajo | ⏳ |
| 2 | `approval-repository.ts` (llamadas a SPs) | 2h | Medio | ⏳ |
| 3 | Conectar flujo en `actions.ts` | 2h | Alto | ⏳ |
| 4 | `obtenerIdNumericoSolicitud()` | 0.75h | Bajo | ⏳ |
| 5 | Pruebas E2E en SOFTLANDQA | 2h | Bajo | ⏳ |
| **TOTAL** | | **~7.25h** | | |

---

## Orden de Ejecución Recomendado

```
Tarea 1 → Tarea 4 → Tarea 2 → Tarea 3 → Tarea 5
```

La Tarea 1 primero para tener la configurabilidad disponible. Tarea 4 antes que 2 porque `approval-repository.ts` la necesita. Tarea 3 al último porque integra todo.

---

## Notas de Arquitectura

- **No crear un endpoint REST nuevo** — el flujo de aprobación va por Server Actions (igual que hoy). Solo se agrega lógica en `actions.ts` y un nuevo módulo de repositorio.
- **El modo demo permanece intacto** — cuando `SOFTLAND_EXECUTION_ENABLED=false` (default), el comportamiento es exactamente igual al actual. No hay regresión posible en ese modo.
- **Fire-and-forget sigue siendo válido** — el procesamiento real del SP puede tardar segundos. Se mantiene el patrón `void ejecutarAprobacionReal(id)` + polling periódico desde el cliente (ya implementado en `PortalApp.tsx`).
- **Transacciones** — los SPs ya manejan sus propias transacciones internamente. El código TypeScript no debe wrappear en transacciones externas.
- **Conexión de BD** — usar `getPortalPool()` existente. El portal y Softland están en el mismo servidor SQL (`PORTAL_DB_*` env vars). El SP recibe el `ID_SOLICITUD` y accede al esquema Softland internamente.
