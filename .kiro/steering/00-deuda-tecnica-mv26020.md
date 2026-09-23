---
inclusion: always
---

# ⚠️ AVISO DE DEUDA TÉCNICA — MV26020 Cálculo de Listas de Precio

> Este archivo se carga automáticamente al inicio de cada sesión de trabajo.
> La deuda fue identificada el **2026-09-18** mediante revisión directa del código.
> El equipo decidió **diferir todas las decisiones** — no han sido resueltas aún.

---

## INSTRUCCIÓN PARA KIRO

**AL INICIO DE CUALQUIER SESIÓN DE TRABAJO EN ESTE PROYECTO**, antes de ejecutar cualquier tarea nueva, debes:

1. Mostrar el resumen de deuda técnica pendiente (tabla al final de este archivo).
2. Preguntar al usuario si desea atender algún ítem de deuda antes de continuar con el trabajo planificado.
3. Si el usuario decide no atender la deuda, continuar con la tarea solicitada **sin modificar** los ítems de deuda.
4. Si el usuario decide atender un ítem, seguir el plan descrito en `aidlc-docs/deuda-tecnica.md` para ese ítem específico.

El detalle completo de cada ítem (situación actual, decisiones pendientes, impacto en código) está en:
```
aidlc-docs/deuda-tecnica.md
```

---

## Resumen de Deuda Técnica Activa

| ID | Descripción | Severidad | RF/RNF afectados | Estado |
|----|-------------|-----------|-----------------|--------|
| DT-01 | **Sin SSO / token firmado** — Login por email plain text sin OIDC/SAML. `idpSubject` siempre `null`. | 🔴 Alta | RNF-01, RNF-03 | ⏳ Diferida |
| DT-02 | **Estado BORRADOR no implementado** — La app va directo de formulario a PENDIENTE. Sin guardar y retomar. | 🟡 Media | RF-17 | ⏳ Diferida |
| DT-03 | **Flujo de cancelación no implementado** — No existe `SOLICITUD_CANCELADA` en EventoTipo. Los SPs de BD están listos pero sin conectar. | 🟡 Media | RF-18, RF-32 | ⏳ Diferida |
| DT-04 | **Rol Auditor/Admin no implementado** — Solo existen OPERADOR y APROBADOR. La auditoría es visible para todos los roles. | 🟡 Media | RF-33 | ⏳ Diferida |
| DT-05 | **Sin línea base de seguridad HTTP** — Sin CSP, HSTS, X-Frame-Options ni rate limiting en `next.config.mjs`. | 🔴 Alta | RNF-07 | ⏳ Diferida |
| DT-06 | **Sin suite de pruebas automatizadas** — No existen archivos `*.test.ts` ni configuración de Vitest. | 🟡 Media | RNF-11, RNF-12 | ⏳ Diferida |

---

## Estado actual del proyecto

- **Fase activa:** CONSTRUCTION — PASO 4 (Integración real con Softland)
- **Próxima tarea:** Ejecutar las 5 tareas del PASO 4 según `aidlc-docs/construction/planes/paso4-plan-trabajo.md`
- **Bloqueante principal resuelto en PASO 4:** `esEjecucionSoftlandBloqueada()` hardcoded en `return true` → los SPs nunca se ejecutan al aprobar

---

## Cómo cerrar un ítem de deuda

Cuando el equipo tome una decisión sobre un ítem:

1. Actualizar el estado del ítem en este archivo de `⏳ Diferida` a `✅ Resuelta` o `🚫 Descartada`
2. Actualizar `aidlc-docs/deuda-tecnica.md` con la decisión tomada y el PASO/tarea asignada
3. Registrar la decisión en `aidlc-docs/audit.md`
4. Si se implementa: eliminar el ítem de ambos archivos una vez el código esté en producción
