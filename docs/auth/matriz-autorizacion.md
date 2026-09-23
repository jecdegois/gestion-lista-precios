# Matriz de autorización

Contrato que acompaña a [`plan-gestion-completa-usuarios-autenticacion.md`](./plan-gestion-completa-usuarios-autenticacion.md).
Define **qué puede hacer cada rol** sobre los endpoints existentes y **quién lo exige** en código.
Implementación: `src/server/auth-guard.ts` — la matriz es lo que ese módulo impone, no una tabla
paralela.

## Inventario protegido

Server Actions en `src/app/actions.ts` y rutas API en `src/app/api/`. Todo endpoint existente
entra en la matriz; los nuevos nacen con su fila.

## Capas de control (en cascada)

Cada endpoint exige, de lo más barato a lo más caro:

1. **Sesión** — cookie válida contra `sessions` (Postgres): no expirada, no revocada, y
   `expires_at` en el futuro o `created_at` anterior a `users.password_updated_at` (§5.4 del
   diccionario). Sin sesión → `401` / redirect a login.
2. **Estado de la cuenta** — `active` para todo; `pending` solo mi-cuenta / estado / cambio de
   contraseña; `inactive` nada.
3. **Ámbito de compañía** — todo dato de solicitud, auditoría o catálogo filtrado por
   `AuthContext.companies` (compañías con relación activa). El admin global ve todas.
4. **Rol en la compañía** — asignación vigente en `users_roles` (`revoked_at` nulo, rol activo).
   Sin permiso → `403` + evento `access_denied` en `security_audit`.
5. **Reglas de negocio** — bloqueo de autoaprobación, simulación no operativa, etc.

## Matriz

| Endpoint / acción | operator | approver | auditor | admin global | Regla extra |
|---|---|---|---|---|---|
| Login, registro, recuperación (reemplazo de `resolverIdentidad`) | público | público | público | público | rate-limit por `access_counters`, respuesta genérica |
| Mi cuenta, estado pendiente, cambiar contraseña | ✓ (autenticado) | ✓ | ✓ | ✓ | `pending` incluido |
| Portal general (`page.tsx`), `GET /api/companias` | ✓ | ✓ | ✓ | ✓ | solo sus compañías |
| `obtenerCatalogoSolicitud`, `GET /api/catalogo/articulos` | ✓ | ✓ | ✓ | ✓ | solo niveles/artículos de sus compañías |
| `parsearExcel`, `GET /api/plantilla` | ✓ | — | — | ✓ | plantilla es insumo del operador |
| `simularManual`, `simularGestionGlobalPaginado`, `GET /api/simulacion/*` | ✓ | — | — | ✓ | simular no es operar |
| `enviarSolicitud` | ✓ | — | — | ✓ | la compañía del input debe estar en el ámbito |
| `obtenerSolicitudes`, `GET /api/solicitudes` | ✓ | ✓ | ✓ (lectura) | ✓ | operator: propias + su compañía |
| `registrarRevision` (abrir detalle) | ✓ (propios, consulta) | ✓ | ✓ | ✓ | registra `SIMULACION_REVISADA` |
| `aprobarSolicitud`, `rechazarSolicitud` | — | ✓ | — | ✓ | identidad ≠ solicitante; ver nota de autoaprobación |
| `obtenerAuditoria`, `GET /api/auditoria` | — | — | ✓ | ✓ | solo lectura |

`—` = acceso denegado. `✓` = requiere sesión activa y el rol en la compañía del recurso (o admin
global). El `✓ (autenticado)` de mi-cuenta vale con cualquier estado de cuenta.

### Nota de autoaprobación

`aprobarSolicitud` y `rechazarSolicitud` comparan la identidad autenticada (`AuthContext.userId`)
contra el solicitante de la solicitud: `SOLICITUD_PRECIO.ID_USUARIO_SOLICITANTE_UID` cuando existe,
con respaldo en el correo normalizado para solicitudes anteriores a la migración. Ni el rol ni el
cambio de rol posterior habilitan la autoaprobación.

## Implementación: `src/server/auth-guard.ts`

La matriz no se duplica en cada endpoint. El módulo central expone tres helpers:

- `requireSession(): Promise<AuthContext>` — capa 1 + 2. Devuelve el contexto o lanza `401`.
- `requireRole(company: string | undefined, roles: RoleCode[]): Promise<AuthContext>` — capas 3 y
  4. Valida admin global o rol en la compañía, filtra el ámbito y lanza `403` con auditoría.
- `requireApprover(company: string): Promise<AuthContext>` — helper de decisión: rol `approver`
  **y** bloqueo de autoaprobación en un solo lugar.

Patrón de uso en cada endpoint (una línea):

```ts
const ctx = await requireRole(input.compania, ["operator"]);
```

`resolverIdentidad` deja de ser el mecanismo de acceso: pasa a ser el flujo de login real y ninguna
ruta confía en correo, nombre o rol enviados por el navegador.

## Riesgos cubiertos

- Acceso directo a rutas API sin sesión (`401`).
- Identidad manipulada: el contexto sale de la sesión del servidor, nunca del payload.
- Escaparse del ámbito de compañía: el filtro es server-side.
- Autoaprobación incluso tras cambio de rol del solicitante (regla por `uuid`/correo).
- Login sin revelar existencia de cuentas: respuesta genérica en los bloqueos.
