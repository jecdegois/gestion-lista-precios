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

## DT-02 — Estado BORRADOR ✅ RESUELTO

**Requisitos afectados:** RF-17  
**Severidad:** Media  
**Resuelto:** 2026-09-21 — Sesión de deuda técnica

### Decisión tomada
Se implementó el estado BORRADOR en BD y en la aplicación. El borrador se guarda en `PORTAL_PRECIOS.SOLICITUD` con `ESTADO = 'BORRADOR'` y puede ser enviado a aprobación desde la vista "Mis solicitudes".

### Cambios implementados
- `domain-types.ts` — `EstadoSolicitud` ahora incluye `"BORRADOR"`; `EventoTipo` incluye `"SOLICITUD_GUARDADA_BORRADOR"` y `"BORRADOR_ENVIADO"`
- `portal-repository.ts` — `agregarSolicitud()` usa `@estado` parametrizado en el INSERT (ya no hardcodea `'PENDIENTE'`)
- `actions.ts` — nuevas funciones `guardarBorrador()` y `enviarBorrador()`
- `NuevaSolicitud.tsx` — botón "Guardar borrador" junto al botón "Enviar a Aprobación"
- `Badges.tsx` — `EstadoBadge` renderiza el estado `BORRADOR` con badge gris

### Nota BD
La constraint `CK_PP_SOL_ESTADO` de SOFTLANDQA debe actualizarse para permitir el valor `'BORRADOR'`. Pendiente ejecutar script de ALTER en BD.

---

## DT-03 — Flujo de cancelación ✅ RESUELTO

**Requisitos afectados:** RF-18, RF-32  
**Severidad:** Media  
**Resuelto:** 2026-09-21 — Sesión de deuda técnica

### Decisión tomada
Se implementó el flujo maker-checker de cancelación: el solicitante pide la cancelación (estado `CANCELACION_SOLICITADA`) y el aprobador confirma o deniega. Los SPs de BD ya existían (PASO 2); se conectaron desde TypeScript.

### Cambios implementados
- `domain-types.ts` — `EstadoSolicitud` += `"CANCELACION_SOLICITADA"` y `"CANCELADO"`; `EventoTipo` += `"CANCELACION_SOLICITADA"`, `"CANCELACION_CONFIRMADA"`, `"CANCELACION_DENEGADA"`
- `events.ts` — etiquetas en español para los nuevos EventoTipos
- `actions.ts` — nuevas funciones `solicitarCancelacion()` y `decidirCancelacion()`
- `PortalApp.tsx` — nuevos handlers `handleCancelar()` y `handleDecidirCancelacion()`
- `MisSolicitudes.tsx` — botón "Cancelar" visible para solicitudes PENDIENTE propias (con prompt de motivo)
- `RevisionModal.tsx` — bloque de UI para que el solicitante pida cancelación; bloque separado para que el aprobador confirme/deniegue cuando estado = `CANCELACION_SOLICITADA`
- `Badges.tsx` — badges para `CANCELACION_SOLICITADA` (naranja) y `CANCELADO` (rojo)

### Nota BD
Los SPs `SP_SOLICITAR_CANCELACION` y `SP_DECIDIR_CANCELACION` ya existían en SOFTLANDQA (PASO 2, Tareas 3 y 4). Las nuevas actions de TypeScript llaman directamente a `actualizarSolicitud()` en el portal; si se desea también ejecutar los SPs de Softland al cancelar, se debe conectar de manera similar al PASO 4.

---

## DT-04 — Rol Auditor/Admin ✅ RESUELTO

**Requisitos afectados:** RF-33  
**Severidad:** Media  
**Resuelto:** 2026-09-21 — Sesión de deuda técnica

### Decisión tomada
Se implementó el rol `AUDITOR` con acceso de solo lectura al historial completo. El auditor aterriza directamente en la vista de Auditoría al iniciar sesión y no puede crear ni aprobar solicitudes.

### Cambios implementados
- `domain-types.ts` — `Rol` += `"AUDITOR"`
- `actions.ts → resolverIdentidad()` — SQL ampliado a `IN ('OPERADOR', 'APROBADOR', 'AUDITOR')`; validación TypeScript actualizada
- `PortalApp.tsx` — navegación post-login: AUDITOR redirige a `"auditoria"` (antes solo bifurcaba APROBADOR/resto); nuevo flag `esAuditor`; `onCancelar` no se pasa a `MisSolicitudes` para rol AUDITOR
- `Header.tsx` — pestaña "Nueva Solicitud" oculta para rol AUDITOR

### Nota BD
Para que un usuario pueda autenticarse como AUDITOR, debe existir un registro en `PORTAL_PRECIOS.USUARIO` con `ROL_GLOBAL = 'AUDITOR'` y la constraint `CK_PP_USR_ROL` debe permitir ese valor. Pendiente ejecutar script de ALTER + INSERT en SOFTLANDQA.

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

| ID | Descripción | Severidad | RF/RNF | Estado |
|----|-------------|-----------|--------|--------|
| DT-01 | Sin SSO / token firmado | 🔴 Alta | RNF-01, RNF-03 | ⏳ Diferida |
| DT-02 | Estado BORRADOR | 🟡 Media | RF-17 | ✅ Resuelta (2026-09-21) |
| DT-03 | Flujo de cancelación | 🟡 Media | RF-18, RF-32 | ✅ Resuelta (2026-09-21) |
| DT-04 | Rol Auditor/Admin | 🟡 Media | RF-33 | ✅ Resuelta (2026-09-21) |
| DT-05 | Sin línea base de seguridad HTTP | 🔴 Alta | RNF-07 | ⏳ Diferida |
| DT-06 | Sin suite de pruebas automatizadas | 🟡 Media | RNF-11, RNF-12 | ⏳ Diferida |

---

| DT-07 | Retomar borrador: precarga incompleta en NuevaSolicitud | 🟡 Media | RF-17 | ⏳ Diferida |


---

## DT-07 — Retomar borrador: precarga incompleta en NuevaSolicitud

**Requisitos afectados:** RF-17 (estado BORRADOR)  
**Severidad:** Media — el borrador se guarda y se lista correctamente, pero al retomarlo no se precargan los datos del formulario  
**Identificado:** 2026-09-21

### Situación actual

El botón "Retomar" en `MisSolicitudes` existe y navega al formulario. El componente `NuevaSolicitud` recibe el borrador como prop y usa `key={borradorActivo?.id}` para remontarse, con los `useState` inicializados desde el borrador.

El problema es que React ejecuta `useEffect([tab])`, `useEffect([nivel])` y `useEffect([itemsManual, nivel, factor...])` en el primer render, limpiando los valores que se inicializaron en `useState`. Se agregó `montajeInicialRef` para saltear esos efectos en el montaje, pero el flujo completo no está validado.

### Lo que debe funcionar al retomar

| Proceso | Campos a precargar |
|---|---|
| FACTOR_PRECIO | nivel, factor, filas, simulado=true |
| MAYOREOD_MASIVO | nivel, factor, criteriosArticulo, ack=false (intencional), filas, simulado=true |
| DESCUENTO_LISTA_PRECIO (manual) | nivel, itemsManual (lista de artículos), filas, simulado=true |
| DESCUENTO_LISTA_PRECIO (excel) | archivoNombre, archivoS3Key, filas, simulado=true |
| MARGEN_UTILIDAD_MASIVO | filas (del uploader), simulado=true |

### Archivos involucrados

- `app-web/src/components/NuevaSolicitud.tsx` — lógica de precarga vía `useState` inicial + `montajeInicialRef`
- `app-web/src/components/PortalApp.tsx` — pasa `key={borradorActivo?.id ?? "nueva"}` y `borrador={borradorActivo}`

### Próximos pasos sugeridos

1. Validar en el browser que `montajeInicialRef` efectivamente bloquea los resets en el primer render
2. Verificar proceso por proceso que los campos se cargan correctamente
3. Si persiste el problema con `itemsManual`, considerar inicializarlo **fuera** del `useState` usando una función inicializadora: `useState(() => calcularItemsIniciales(borrador))`

_Este documento se actualiza a medida que se toman decisiones. Cada ítem se cierra cuando el equipo define el alcance y el PASO correspondiente lo implementa._
