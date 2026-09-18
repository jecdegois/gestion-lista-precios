# Deuda Técnica — MV26020 Cálculo de Listas de Precio

> **Registrada:** 2026-09-18  
> **Origen:** Revisión de cobertura real de requisitos pre-PASO 4 (lectura directa de código)  
> **Decisión del equipo:** Diferida — no se toman decisiones en este momento. Revisar al inicio de la próxima sesión de trabajo.  
> **Responsable de decisión:** Pendiente asignación  

---

## DT-01 — Sin SSO ni token firmado (CRÍTICO para producción)

**Requisitos afectados:** RNF-01, RNF-03  
**Severidad:** Alta — es una deuda de seguridad para entorno productivo  
**Prioridad sugerida:** Pre-producción (bloqueante para go-live, no para QA interno)

### Situación actual
`LoginScreen.tsx` autentica por email plain text + compañía, haciendo un `SELECT` directo en `PORTAL_PRECIOS.USUARIO`. No hay OIDC, SAML, OAuth2 ni ningún mecanismo de identidad federada.

El campo `idpSubject` existe en el modelo de datos (`domain-types.ts → Identidad`) y en la tabla `USUARIO.IDP_SUBJECT` de la BD, pero siempre llega `null` porque nunca se popula desde un proveedor real.

`resolverIdentidad()` en `actions.ts` recibe el email como string sin firma ni expiración. Cualquier persona que conozca el email de otro usuario y su compañía puede autenticarse como ese usuario.

### Lo que dice el requisito
- **RNF-01:** integración con SSO o IdP corporativo; operar en red corporativa o VPN.
- **RNF-03:** el portal debe entregar la identidad del usuario a la aplicación mediante un mecanismo firmado o tokenizado de corta duración, validado por el backend.

### Decisiones pendientes
1. ¿Qué IdP corporativo se usa? (Azure AD / Entra ID, Google Workspace, Okta, otro)
2. ¿El login es directo desde la app o delegado desde el portal interno de la empresa?
3. ¿Se implementa antes de QA o es post-MVP?
4. ¿La restricción de red (VPN) la maneja infraestructura o la app debe validarla?

### Impacto en código cuando se implemente
- `LoginScreen.tsx` — reemplazar formulario email/compañía por redirect OIDC o consumo de token del portal
- `actions.ts → resolverIdentidad()` — recibir y validar token firmado en lugar de email plain text
- `USUARIO.IDP_SUBJECT` — poblar con el subject real del IdP al crear/actualizar usuarios

---

## DT-02 — Estado BORRADOR no implementado

**Requisitos afectados:** RF-17  
**Severidad:** Media — funcionalidad faltante pero no crítica para el flujo principal  
**Prioridad sugerida:** Post-MVP v1.1

### Situación actual
`domain-types.ts → EstadoSolicitud` define: `PENDIENTE | EN_PROCESO | PROCESADO | PROCESADO_CON_ERRORES | RECHAZADO | ERROR_EJECUCION`.

El estado `BORRADOR` mencionado en RF-17 no existe. La app va directamente de formulario a `PENDIENTE` al hacer clic en "Enviar a Aprobación". No hay opción de guardar un borrador para retomar después.

### Lo que dice el requisito
- **RF-17:** cada solicitud debe manejar los estados Borrador, Pendiente de aprobación, Aprobada, Ejecutando, Ejecutada, Rechazada y Error de ejecución.

### Decisiones pendientes
1. ¿Se implementa BORRADOR? ¿El solicitante necesita guardar y retomar?
2. ¿Un borrador expira? ¿Cuánto tiempo?
3. ¿El borrador se guarda en BD o solo en localStorage del navegador?

### Impacto en código cuando se implemente
- `domain-types.ts` — agregar `"BORRADOR"` a `EstadoSolicitud`
- `portal-repository.ts` — `agregarSolicitud()` con estado inicial BORRADOR
- `actions.ts` — nueva función `guardarBorrador()` separada de `enviarSolicitud()`
- `NuevaSolicitud.tsx` — botón "Guardar borrador" + recuperación de borrador existente
- BD: `CK_PP_SOL_ESTADO` debe permitir el valor 'BORRADOR'

---

## DT-03 — Flujo de cancelación no implementado

**Requisitos afectados:** RF-18, RF-32 (evento SOLICITUD_CANCELADA)  
**Severidad:** Media — el RF-18 menciona que el solicitante puede cancelar  
**Prioridad sugerida:** Post-MVP v1.1

### Situación actual
`EventoTipo` en `domain-types.ts` no incluye `SOLICITUD_CANCELADA`. No existe ninguna función de cancelación en `actions.ts`. El solicitante no tiene forma de retirar una solicitud que ya envió a aprobación.

Los SPs de BD (`sp_solicitar_cancelacion`, `sp_decidir_cancelacion`) ya están validados en SOFTLANDQA (PASO 2, Tareas 3 y 4), con campos `CANCELACION_SOLICITADA` y `CANCELACION_CONFIRMADA` en la tabla `SOLICITUD`.

### Lo que dice el requisito
- **RF-18:** el Solicitante debe cancelarla o crear una nueva solicitud.
- **RF-32:** la bitácora debe registrar cancelación.

### Decisiones pendientes
1. ¿El cancelado va directo (solicitante cancela unilateralmente) o requiere confirmación del aprobador?
2. ¿Una solicitud cancelada puede reabrirse?
3. ¿Entra en el alcance del PASO 4 o es un PASO 5 separado?

### Impacto en código cuando se implemente
- `domain-types.ts` — agregar `"CANCELADO"` a `EstadoSolicitud` y `"SOLICITUD_CANCELADA"` a `EventoTipo`
- `actions.ts` — nuevas funciones `solicitarCancelacion()` y `decidirCancelacion()`
- `MisSolicitudes.tsx` — botón "Cancelar" para solicitudes en estado PENDIENTE
- `BandejaAprobacion.tsx` — indicador visual de cancelación solicitada para el aprobador
- BD: los SPs ya existen — solo conectar desde TypeScript

---

## DT-04 — Rol Auditor/Admin no implementado

**Requisitos afectados:** RF-33 (acceso de solo lectura al historial completo)  
**Severidad:** Baja para operación diaria; Media para cumplimiento/auditoría  
**Prioridad sugerida:** Post-MVP v1.1

### Situación actual
`domain-types.ts → Rol` solo define `"OPERADOR" | "APROBADOR" | "SIN_PERMISO"`. La tabla `USUARIO.ROL_GLOBAL` en BD tampoco tiene registros con rol Auditor.

La vista de Auditoría (`Auditoria.tsx`) es accesible para cualquier usuario autenticado sin restricción de rol. Esto significa que un OPERADOR puede ver los eventos de auditoría de solicitudes que no son suyas.

### Lo que dice el requisito
- **RF-33:** los Auditores/Administradores consultan el historial completo en solo lectura, dentro de su autorización.

### Decisiones pendientes
1. ¿Se necesita el rol Auditor antes de QA?
2. ¿El Auditor tiene su propia vista o comparte la bandeja del Aprobador?
3. ¿Qué ámbito tiene el Auditor — toda la organización o por compañía?

### Impacto en código cuando se implemente
- `domain-types.ts` — agregar `"AUDITOR"` a `Rol`
- BD: `CK_PP_USR_ROL` debe permitir 'AUDITOR'; insertar usuarios con ese rol
- `PortalApp.tsx` — nueva vista para Auditor (solo lectura, historial completo)
- `actions.ts → resolverIdentidad()` — incluir ROL_GLOBAL = 'AUDITOR' en la query

---

## DT-05 — Sin línea base de seguridad HTTP

**Requisitos afectados:** RNF-07  
**Severidad:** Alta para producción; Baja para QA interno  
**Prioridad sugerida:** Pre-producción

### Situación actual
`next.config.mjs` no define headers de seguridad. No hay:
- Content Security Policy (CSP)
- X-Frame-Options / frame-ancestors
- Strict-Transport-Security (HSTS)
- X-Content-Type-Options
- Referrer-Policy
- Rate limiting en API routes

### Impacto en código cuando se implemente
- `next.config.mjs` — agregar bloque `headers()` con las directivas de seguridad
- API routes — agregar middleware de rate limiting (ej. con `@upstash/ratelimit` o similar)

---

## DT-06 — Sin suite de pruebas automatizadas

**Requisitos afectados:** RNF-11, RNF-12  
**Severidad:** Media — los cálculos son deterministas y requieren cobertura formal  
**Prioridad sugerida:** Paralelo al PASO 4 o PASO 5

### Situación actual
No existe ningún archivo `*.test.ts`, `*.spec.ts` ni configuración de framework de pruebas en `app-web/`. Las funciones críticas de cálculo (`convertirPorcentajeAFactor`, `calcularVariacion`, `construirFilaCompleta`, `construirFilaMargenMasivo`) son deterministas y testables sin mocks.

### Lo que dice el requisito
- **RNF-11:** pruebas basadas en propiedades para cálculos deterministas de precio, validaciones de factor y validaciones de archivos.
- **RNF-12:** comprobar límites de factor: v<=0 inválido, 0<v<1 rebaja, v=1 sin cambio, 1<v<=2 aumento.

### Decisiones pendientes
1. ¿Qué framework? (Vitest recomendado para Next.js 14)
2. ¿Solo unit tests o también integration/E2E (Playwright)?
3. ¿Entra en PASO 4 o es un PASO separado?

### Impacto en código cuando se implemente
- Instalar `vitest` + `@vitest/coverage-v8`
- Crear `app-web/src/lib/__tests__/engine.test.ts` — casos límite de factor
- Crear `app-web/src/lib/__tests__/margin.test.ts` — cálculo de margen mínimo
- Crear `app-web/src/lib/__tests__/rounding.test.ts` — redondeo comercial

---

## Tabla resumen

| ID | Descripción | Severidad | RF/RNF | Cuando decidir |
|----|-------------|-----------|--------|---------------|
| DT-01 | Sin SSO / token firmado | 🔴 Alta | RNF-01, RNF-03 | Pre-producción |
| DT-02 | Estado BORRADOR no implementado | 🟡 Media | RF-17 | Post-MVP v1.1 |
| DT-03 | Flujo de cancelación no implementado | 🟡 Media | RF-18, RF-32 | Post-MVP v1.1 |
| DT-04 | Rol Auditor/Admin no implementado | 🟡 Media | RF-33 | Post-MVP v1.1 |
| DT-05 | Sin línea base de seguridad HTTP | 🔴 Alta | RNF-07 | Pre-producción |
| DT-06 | Sin suite de pruebas automatizadas | 🟡 Media | RNF-11, RNF-12 | PASO 4 o PASO 5 |

---

_Este documento se actualiza a medida que se toman decisiones. Cada ítem se cierra cuando el equipo define el alcance y el PASO correspondiente lo implementa._
