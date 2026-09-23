# Arquitectura de módulos (features)

Cómo se construye cada módulo de `app-web`. Este documento es la norma; el módulo
`src/features/auth/` es el ejemplo vivo que la ilustra.

## Principio

- **Zod es la única fuente de verdad de validación.** El mismo schema que valida en el servidor es
  el que validan los formularios en el cliente (React Hook Form + `zodResolver`). No hay
  validaciones duplicadas ni divergentes.
- **Cuatro capas por módulo**, con dependencias en una sola dirección:

```
features/<modulo>/
├── schemas/          ← Zod: contratos de entrada/salida del módulo
├── actions/          ← "use server": frontera de confianza. Valida y delega
├── services/         ← lógica de negocio. No toca la base de datos
└── repository/       ← ÚNICA capa que habla con la base de datos
```

`actions → services → repository → lib (Prisma / mssql)`. Nadie salta capas: un service nunca
importa Prisma, y una action nunca ejecuta SQL.

## Reglas por capa

### `schemas/` — contratos con Zod

- Un archivo por dominio (`auth-schema.ts`, `solicitud-schema.ts`), schemas con nombre
  `XxxSchema`, tipos derivados con `z.infer` (`type XxxInput = z.infer<typeof XxxSchema>`) —
  **los tipos nunca se escriben a mano**.
- Composición por reuso: un `BaseSchema` del que se derivan variantes con `.pick({ ... })` y
  `.extend(...)`; validaciones entre campos con `.refine` apuntando `path` al campo donde se
  muestra el error.
- Mensajes de error en español, orientados al usuario final.
- Valores por defecto y coerciones se resuelven en el schema (`z.coerce.number()`, `.default()`),
  no en la capa de abajo.

### `actions/` — frontera de confianza

- Archivo `"use server"`, funciones `xxxAction(input: XxxInput)`.
- **Toda entrada se valida con `Schema.safeParse`** antes de hacer nada; en fallo se devuelve un
  resultado con error genérico, sin filtrar detalles internos.
- Devuelven objetos serializables (nada de clases, `Date` con cuidado, nunca instancias Prisma).
- Aquí se aplican los **auth-guards** de la [matriz de autorización](./auth/matriz-autorizacion.md):
  `requireSession()` / `requireRole(company, roles)` antes de llamar al service. La validación de
  schema no sustituye la autorización.
- Delegan en el service del módulo; no contienen lógica de negocio.

### `services/` — lógica de negocio

- Un service por caso de uso (`auth-service.ts` exportando `authService`, patrón singleton).
- Orquesta reglas: rate-limiting, comparación de hashes, bloqueo de autoaprobación, purga lazy,
  redacción de mensajes.
- No conoce HTTP ni Server Actions: es puro dominio sobre los repositories.
- Las reglas de la matriz (autoaprobación, ámbito) viven aquí, no en los forms.

### `repository/` — único acceso a datos

- `xxx-repository.ts` por módulo. Encapsula Prisma o `mssql`: el resto del módulo no sabe qué
  motor hay detrás.
- **Identidad** (usuarios, sesiones, tokens, roles, auditoría de seguridad) → cliente Prisma de
  Postgres (`src/lib/prisma.ts`, generado de `prisma-postgres/`).
- **Operativo** (solicitudes, auditoría de solicitudes, maestros Softland por compañía) →
  `mssql` contra `PORTAL_PRECIOS` / esquema de la compañía (`src/server/db.ts`); SPs autorizados
  se ejecutan aquí, nunca en services ni actions.
- Consultas crudas siempre con el esquema calificado (`PORTAL_PRECIOS.TABLA`).
- Traduce filas ↔ tipos de dominio (`src/lib/domain-types.ts`); los tipos de DB no se filtran
  hacia arriba.

## Formularios (React Hook Form)

- Componentes cliente con `useForm<XxxInput>({ resolver: zodResolver(XxxSchema) })`.
- El server action se llama con `form.getValues()` ya validado; los errores que devuelve la
  action (`error`) se muestran con el estado del form (`setError` / banner).
- Nada de validación ad-hoc en JSX: si un campo necesita una regla, va al schema y ya vale para
  ambos lados.

## Mapeo a este proyecto

| Módulo | Alberga | Fuente de datos | Estado |
|---|---|---|---|
| `features/auth` | login, registro, recuperación, sesiones, mi cuenta | Prisma (Postgres) | esqueleto creado (schemas + actions) |
| `features/usuarios` | administración de usuarios, aprobación, permisos | Prisma (Postgres) | por crear |
| `features/solicitudes` | crear/simular/enviar/aprobar solicitudes | `mssql` → `PORTAL_PRECIOS` + SPs | migrar desde `src/server/` |
| `features/simulacion` | simulación manual y gestión global | `mssql` + maestros por compañía | migrar |
| `features/auditoria` | auditoría de solicitudes | `mssql` → `AUDITORIA_EVENTOS` | migrar |

- `src/app/actions.ts` actual **se desmiembra** en estos módulos: su lógica de consultas va a
  repositories, sus validaciones a schemas, sus Server Actions a `actions/`.
- `src/server/portal-repository.ts`, `pricing-repository.ts`, `audit-store.ts` son la semilla de
  la capa `repository/` — se mueven y renombran dentro de cada feature.
- `resolverIdentidad` desaparece; en su lugar, sesiones reales (`auth-guard`), y el acceso por
  rol queda exigido en `actions/`.

## Convenciones

- Nombres de archivos en kebab-case (`solicitud-schema.ts`), tipos `XxxInput`/`XxxOutput`,
  servicios/repositorios exportados como singletons (`export const solicitudService = ...`).
- Los schemas son compartidos: los importa la `action`, el service (para tipos) y el form.
- Un módulo nuevo nace con sus 4 carpetas aunque alguna empiece vacía — la estructura es estable.

## Dependencias requeridas

- `zod` (v4 — sintaxis `z.email()`, `error:`)
- `react-hook-form`
- `@hookform/resolvers` (para `zodResolver`)
