# Entidades del módulo de gestión de usuarios y autenticación

Diccionario de datos que acompaña a [`plan-gestion-completa-usuarios-autenticacion.md`](./plan-gestion-completa-usuarios-autenticacion.md).
Aquel documento define el comportamiento; este define **qué entidades se crean y con qué campos**.

## Arquitectura de datos

Toda la gestión de usuarios vive en **PostgreSQL**. SQL Server conserva únicamente lo operativo del
portal.

| PostgreSQL — identidad | SQL Server `[PORTAL_PRECIOS]` — operación |
|---|---|
| `users` | `SOLICITUD_PRECIO` |
| `users_company` | `SOLICITUD_PRECIO_DETALLE` |
| `roles` | `AUDITORIA_EVENTOS` |
| `users_roles` | `COMPANIA`, `LISTA_PRECIO` |
| `sessions` | |
| `security_tokens` | |
| `access_counters` | |
| `security_audit` | |

Consecuencias:

- `PORTAL_PRECIOS.USUARIO` y `PORTAL_PRECIOS.USUARIO_AMBITO` **quedan obsoletas**. No se borran — el
  historial y la FK de `SOLICITUD_PRECIO` dependen de ellas —, pero dejan de escribirse: pasan a ser
  el origen de una migración única hacia Postgres. Igual suerte corren `FN_USUARIO_EN_AMBITO` y
  `V_USUARIO_AMBITO`, que dejan de ser el mecanismo de autorización.
- **No hay llaves foráneas entre motores.** Dentro de Postgres las ocho entidades se referencian
  normalmente; hacia SQL Server la integridad la sostiene la aplicación.
- `users_company.company` guarda el código de compañía como texto, **sin FK ni tabla espejo**: la
  fuente de verdad sigue siendo `COMPANIES_CONFIG` (`app-web/src/server/companies.ts`) y
  `PORTAL_PRECIOS.COMPANIA`.

### Acceso a datos: Prisma

Se usa **Prisma 6** como ORM para las entidades de identidad en PostgreSQL. El operativo en SQL
Server sigue accediendo con `mssql` (consultas raw y SPs existentes); la migración progresiva hacia
Prisma se hará reemplazando la capa de acceso motor por motor.

> **Estado: aprovisionado y configurado.** Postgres corre en Docker y Prisma está operativo contra
> ambos motores (verificado 2026-09-22).

- **Aprovisionamiento local (hecho)**: `docker-compose.yml` en la raíz — PostgreSQL 16, BD
  `gestion_lista_precios`, usuario `portal_app`, datos persistentes en `./postgres/` (bind mount,
  en `.gitignore`). Levantar con `docker compose up -d`.
- **Esquema de identidad (hecho)**: `app-web/prisma-postgres/` — `schema.prisma` + los 8 modelos en
  `models/` (`user`, `company`, `role`, `session`, `token`, `access_counter`, `audit`), fuente de
  verdad del DDL de Postgres. Migración inicial `init` creada y aplicada, con `CREATE EXTENSION
  citext` al inicio y los índices parciales agregados a mano. Migraciones con `prisma migrate`.
- **Esquema SQL Server (configurado, modelos pendientes)**: `app-web/prisma-sqlserver/` —
  `provider = "sqlserver"` con `SQL_SERVER_URL` (`SOFTLANDQA`, esquema `PORTAL_PRECIOS`).
  Conexión y lecturas (`$queryRaw`) verificadas; los modelos se obtienen con `npm run
  sqlserver:pull` (introspección del esquema existente) y se irán migrando progresivamente.
- **Clientes generados** en `app-web/src/generated/postgres` y `app-web/src/generated/sqlserver` —
  salidas separadas para que los dos esquemas convivan en un mismo paquete.
- **Comandos npm**: `db:generate`, `db:migrate`, `db:deploy`, `db:studio` (Postgres) y
  `sqlserver:pull`, `sqlserver:generate`, `sqlserver:studio` (SQL Server). Todos pasan `--schema`
  explícito.
- **Ajustes ya resueltos en el esquema**: los valores de enumeración (`status`, `purpose`,
  `attempt_type`, `revoke_reason`) se materializan como `enum` de Postgres — el equivalente idiomático
  de los `check` del diccionario. Los índices parciales (`users_company`, `users_roles` "un rol por
  compañía", `sessions`, `security_tokens`) y el `CREATE EXTENSION citext` no son modelables por
  Prisma: viven en la migración inicial editada a mano.

### Nomenclatura

Identificadores en inglés, estilo idiomático de PostgreSQL: `snake_case` en minúsculas, tablas en
plural, tipos `uuid`, `text`, `timestamptz`, `boolean`, `bytea`, `citext`, `inet`, `jsonb`.
Extensiones requeridas: `citext` y, en PostgreSQL anterior a 13, `pgcrypto` para `gen_random_uuid()`.

Los valores de enumeración también van en inglés (`pending`, `operator`, `password_reset`, …). El
único punto de traducción es al escribir `AUDITORIA_EVENTOS.ROL` en SQL Server, que conserva el
vocabulario español existente (`OPERADOR`, `APROBADOR`, `AUDITOR`) para no romper el histórico: un
mapa en un solo lugar de la capa de acceso a datos.

Las columnas que se agregan a SQL Server mantienen el estilo de ese esquema (mayúsculas, español),
porque conviven con las que ya existen en esas tablas.

### Decisiones tomadas por defecto

Estas decisiones no estaban explícitas en el plan original. Quedan anotadas para poder revisarlas.

| Decisión | Elección | Motivo |
|---|---|---|
| Rol de administrador | `users.is_admin boolean` | el plan lo llama "administrador global"; `users_company` es por compañía |
| Credenciales | columnas en `users`, sin tabla 1:1 | el plan dice "extender `USUARIO`" |
| Auditoría de seguridad | tabla propia `security_audit` en Postgres | la identidad ya no vive en SQL Server; `AUDITORIA_EVENTOS` se queda con los eventos de solicitud |
| Roles | catálogo `roles` + asignación `users_roles`, no un `check` | agregar un rol pasa a ser un `insert`, no un cambio de esquema |
| Rol `auditor` | se conserva como fila del catálogo | está en el DDL y en el seed actuales; el plan no pide quitarlo |
| `ADMINISTRADOR` | fuera del catálogo, en `users.is_admin` | es global; no se asigna por compañía |
| Límite de intentos | contador agregado, no log de intentos | el plan dice "contadores"; una fila por clave, sin purga |
| Catálogo de compañías | no se replica en Postgres | conjunto de cuatro filas ya gobernado por `COMPANIES_CONFIG` |

---

## 1. Entidades en PostgreSQL

### 1.1 `users`

La cuenta. Reemplaza a `PORTAL_PRECIOS.USUARIO`.

| Campo | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK. Llave estable, también hacia SQL Server |
| `email` | `citext` | no | | `unique`. `citext` resuelve el duplicado por mayúsculas sin columna normalizada aparte |
| `full_name` | `text` | no | | |
| `status` | `text` | no | `'pending'` | `check`: `pending` \| `active` \| `inactive` |
| `is_admin` | `boolean` | no | `false` | administrador global |
| `password_hash` | `text` | sí | | formato autodescriptivo `scrypt$N=…,r=…,p=…$<sal>$<hash>`. Nulo = contraseña sin establecer |
| `password_updated_at` | `timestamptz` | sí | | además de informativa, **invalida las sesiones anteriores** (ver §5.4) |
| `must_change_password` | `boolean` | no | `false` | contraseña temporal del restablecimiento administrativo |
| `created_at` | `timestamptz` | no | `now()` | |
| `approved_at` | `timestamptz` | sí | | |
| `approved_by` | `uuid` | sí | | FK → `users(id)` |
| `last_login_at` | `timestamptz` | sí | | hoy nadie escribe su equivalente; el login empieza a hacerlo |

El correo es inmutable en esta versión, y es **la única llave** que une las solicitudes históricas
(`SOLICITUD_PRECIO.SOLICITANTE_EMAIL`, `AUDITORIA_EVENTOS.USUARIO_EMAIL`) con la cuenta: `users` no
guarda el `ID_USUARIO` anterior.

### 1.2 `users_company`

A qué compañías tiene acceso un usuario. Junto con `users_roles` reemplaza a
`PORTAL_PRECIOS.USUARIO_AMBITO`.

| Campo | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | no | | FK → `users(id)` `on delete cascade` |
| `company` | `text` | no | | código de `COMPANIES_CONFIG`; sin FK (otro motor) |
| `is_active` | `boolean` | no | `true` | |
| `assigned_at` | `timestamptz` | no | `now()` | |
| `assigned_by` | `uuid` | sí | | FK → `users(id)` |
| `revoked_at` | `timestamptz` | sí | | |

Restricciones: `unique (user_id, company)`. Índice `(company) where is_active`.

### 1.3 `roles`

Catálogo de roles. Dejan de ser un `check` con valores fijos, para que agregar un rol sea un `insert`
y no un cambio de esquema.

| Campo | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `code` | `text` | no | | `unique`. `operator`, `approver`, `auditor` |
| `name` | `text` | no | | etiqueta para la interfaz |
| `description` | `text` | sí | | qué puede hacer el rol |
| `is_active` | `boolean` | no | `true` | permite retirar un rol sin borrar el historial |
| `created_at` | `timestamptz` | no | `now()` | |

Filas iniciales:

| `code` | `name` | `description` |
|---|---|---|
| `operator` | Operador | Crea, simula y envía solicitudes en sus compañías autorizadas |
| `approver` | Aprobador | Revisa, aprueba y rechaza solicitudes en sus compañías autorizadas, sin autoaprobación |
| `auditor` | Auditor | Consulta solicitudes y auditoría de sus compañías, sin operar |

El catálogo contiene solo roles **de compañía**. `ADMINISTRADOR` no entra aquí: es global y vive en
`users.is_admin`, porque no se asigna por compañía.

### 1.4 `users_roles`

Qué rol tiene el usuario en una compañía. Se asigna sobre la relación usuario-compañía, no sobre el
usuario: es lo que permite roles distintos entre compañías.

| Campo | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `users_company_id` | `uuid` | no | | FK → `users_company(id)` `on delete cascade` |
| `role_id` | `uuid` | no | | FK → `roles(id)` |
| `assigned_at` | `timestamptz` | no | `now()` | |
| `assigned_by` | `uuid` | sí | | FK → `users(id)` |
| `revoked_at` | `timestamptz` | sí | | |

Restricciones: `unique (users_company_id, role_id)` evita la asignación repetida. La regla **un solo
rol por compañía** que fija el plan se impone con un índice único parcial
`(users_company_id) where revoked_at is null`; el día que se permitan varios roles por compañía se
quita ese índice y nada más cambia.

### 1.5 `sessions`

Sesión opaca. La cookie lleva un identificador aleatorio y la tabla solo guarda su hash, de modo que
un volcado de la tabla no permite suplantar a nadie.

| Campo | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `token_hash` | `bytea` | no | | `unique`. SHA-256 del identificador de la cookie |
| `user_id` | `uuid` | no | | FK → `users(id)` `on delete cascade` |
| `created_at` | `timestamptz` | no | `now()` | |
| `expires_at` | `timestamptz` | no | | creación + 8 h |
| `last_used_at` | `timestamptz` | sí | | |
| `revoked_at` | `timestamptz` | sí | | no nula ⇒ sesión muerta |
| `revoke_reason` | `text` | sí | | `check`: `logout`, `password_change`, `password_reset`, `deactivation`, `permissions_change` |
| `ip_address` | `inet` | sí | | |
| `user_agent` | `text` | sí | | |

Índices: `(user_id) where revoked_at is null` para revocar en bloque; `(expires_at)` para la purga.

### 1.6 `security_tokens`

Los dos enlaces por correo en una sola tabla: comparten forma — hash, vencimiento, consumo único — y
solo difieren en la ventana de validez.

| Campo | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `token_hash` | `bytea` | no | | `unique` |
| `user_id` | `uuid` | no | | FK → `users(id)` `on delete cascade` |
| `purpose` | `text` | no | | `check`: `password_reset` (30 min) \| `admin_invite` (24 h) |
| `created_at` | `timestamptz` | no | `now()` | |
| `expires_at` | `timestamptz` | no | | |
| `consumed_at` | `timestamptz` | sí | | consumo único |
| `invalidated_at` | `timestamptz` | sí | | al reenviar el enlace, los anteriores se invalidan |
| `issued_by` | `uuid` | sí | | FK → `users(id)`. Administrador que generó el alta o el reenvío |

Índice parcial `(user_id, purpose) where consumed_at is null and invalidated_at is null`.

### 1.7 `access_counters`

Límite compartido de intentos. Una fila por clave y tipo — no un log que crezca sin límite —; la
ventana se reinicia sola al vencer. No lleva `user_id`: en el registro todavía no existe la cuenta, y
en el login fallido no se debe revelar si existe.

| Campo | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `key` | `citext` | no | | correo o IP. PK compuesta `(key, attempt_type)` |
| `attempt_type` | `text` | no | | `check`: `login` \| `signup` \| `password_reset` |
| `window_start` | `timestamptz` | no | `now()` | |
| `attempts` | `integer` | no | `0` | |
| `last_attempt_at` | `timestamptz` | no | `now()` | |
| `blocked_until` | `timestamptz` | sí | | mientras no venza, la respuesta al usuario es genérica |

### 1.8 `security_audit`

Bitácora de identidad y permisos, append-only.

| Campo | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | `bigint` | no | `generated always as identity` | PK |
| `occurred_at` | `timestamptz` | no | `now()` | |
| `event` | `text` | no | | ver lista abajo |
| `actor_id` | `uuid` | sí | | FK → `users(id)`. Nulo en intentos anónimos |
| `actor_email` | `citext` | sí | | textual: el actor puede no corresponder a una cuenta existente |
| `target_user_id` | `uuid` | sí | | FK → `users(id)`. La cuenta sobre la que se actúa |
| `company` | `text` | sí | | nulo en eventos globales (login, registro, restablecimiento) |
| `ip_address` | `inet` | sí | | |
| `user_agent` | `text` | sí | | |
| `details` | `jsonb` | sí | | contexto del evento; nunca contraseñas ni tokens |

Eventos: `session_started`, `session_ended`, `login_failed`, `signup_requested`, `user_approved`,
`user_created`, `user_deactivated`, `user_reactivated`, `permissions_changed`, `password_changed`,
`password_reset`, `invite_sent`, `access_denied`.

Índices: `(occurred_at desc)`, `(target_user_id, occurred_at desc)`.

---

## 2. Cambios en SQL Server

Solo correlación; ninguna gestión de usuarios.

| Tabla | Campo | Tipo | Notas |
|---|---|---|---|
| `SOLICITUD_PRECIO` | `ID_USUARIO_SOLICITANTE_UID` | `UNIQUEIDENTIFIER NULL` | `users.id` del solicitante. Sin FK |
| `SOLICITUD_PRECIO` | `APROBADOR_UID` | `UNIQUEIDENTIFIER NULL` | `users.id` del aprobador; hoy solo hay correo y nombre |

`ID_USUARIO_SOLICITANTE`, `SOLICITANTE_EMAIL`, `APROBADOR_EMAIL` y `AUDITORIA_EVENTOS.USUARIO_EMAIL`
se conservan intactos para el histórico. `CK_PP_SP_NO_AUTOAPROBACION`, que compara correos, sigue
vigente como red de seguridad, pero la regla real pasa a comparar `uuid` en la aplicación.

Quedan obsoletas, sin borrarse: `PORTAL_PRECIOS.USUARIO`, `PORTAL_PRECIOS.USUARIO_AMBITO`,
`FN_USUARIO_EN_AMBITO`, `V_USUARIO_AMBITO`.

---

## 3. Entidades de aplicación (TypeScript)

En `app-web/src/lib/domain-types.ts`, junto a los tipos existentes:

| Tipo | Campos |
|---|---|
| `UserStatus` | `"pending" \| "active" \| "inactive"` |
| `RoleCode` | `"operator" \| "approver" \| "auditor"` — el `code` del catálogo, tipado en la app. Reemplaza a `Rol`, que hoy mezcla `SIN_PERMISO` |
| `Role` | `id`, `code: RoleCode`, `name`, `description`, `isActive` |
| `UserCompany` | `company`, `role: RoleCode`, `isActive`, `assignedAt` — la app ve el rol plano; el join vive en la capa de datos |
| `User` | `id`, `email`, `fullName`, `status`, `isAdmin`, `companies[]`, `createdAt`, `approvedAt`, `lastLoginAt`, `mustChangePassword` |
| `AuthContext` | `userId`, `email`, `fullName`, `isAdmin`, `companies[]`, `sessionId`, `expiresAt` |
| `TokenPurpose` | `"password_reset" \| "admin_invite"` |
| `UserFilter` | `search?`, `status?`, `company?`, `role?`, `page`, `pageSize` |

`Identidad` — hoy `{ email, nombre, rol, color, compania, idpSubject }` — se reemplaza por
`AuthContext`, que lleva el `uuid` estable con el que se bloquea la autoaprobación. Para solicitudes
anteriores a la migración, sin `ID_USUARIO_SOLICITANTE_UID`, el respaldo es el correo normalizado.

---

## 4. Resumen

| | Entidad | Motor | Acción |
|---|---|---|---|
| 1 | `users` | PostgreSQL | crear |
| 2 | `users_company` | PostgreSQL | crear |
| 3 | `roles` | PostgreSQL | crear |
| 4 | `users_roles` | PostgreSQL | crear |
| 5 | `sessions` | PostgreSQL | crear |
| 6 | `security_tokens` | PostgreSQL | crear |
| 7 | `access_counters` | PostgreSQL | crear |
| 8 | `security_audit` | PostgreSQL | crear |
| 9 | `SOLICITUD_PRECIO` | SQL Server | agregar `ID_USUARIO_SOLICITANTE_UID` y `APROBADOR_UID` |

### Lo que NO se crea

- **Tabla `companies` en Postgres** → cuatro filas estables ya gobernadas por `COMPANIES_CONFIG`;
  replicarlas obligaría a sincronizarlas sin ganancia.
- **Tabla de registros pendientes** → el estado `pending` de `users` la cubre.
- **Tabla de permisos por acción** → el permiso se deriva del rol; el conjunto de acciones es cerrado
  y vive en el código. `roles` queda listo para colgarle una tabla de permisos si eso cambia.
- **Tabla 1:1 de credenciales** → el plan dice extender la entidad usuario.
- **Log de intentos de acceso** → el contador agregado basta, y los fallos quedan en `security_audit`.

---

## 5. Riesgos y consecuencias de trabajar con dos bases

1. **Sin transacción distribuida.** Crear una solicitud escribe en SQL Server con un `uuid` que vive
   en Postgres; un fallo parcial deja datos sin contraparte. La escritura operativa nunca debe
   depender de confirmar algo en Postgres más allá de leer la sesión.
2. **Sin integridad referencial entre motores.** `ID_USUARIO_SOLICITANTE_UID` puede quedar huérfano
   si se borra una fila de `users`; por eso el borrado es lógico (`status = 'inactive'`), nunca
   físico.
3. **Cada request autenticado consulta Postgres** — sesión y permisos vigentes — antes de tocar SQL
   Server.
4. **Revocación de sesiones sin borrado.** Una sesión cuyo `created_at` es anterior a
   `users.password_updated_at` se considera inválida aunque `revoked_at` siga nulo: así el cambio de
   contraseña no depende de recorrer y actualizar filas.
5. **Migración única desde SQL Server.** Hay que mover `USUARIO` y `USUARIO_AMBITO` a Postgres y
   rellenar `ID_USUARIO_SOLICITANTE_UID` en las solicitudes históricas. Como `users` no conserva el
   `ID_USUARIO` anterior, ese cruce es **siempre por correo normalizado**: una cuenta histórica cuyo
   correo no exista en `users` queda sin `uuid`, y la aplicación debe seguir resolviéndola por correo.
6. **Lo que puede fallar en esa migración**, a verificar antes y sin resolver en silencio:
   - correos duplicados que chocan con el `unique` de `citext`;
   - usuarios con más de un rol por compañía que chocan con el índice único parcial de `users_roles`;
   - la **divergencia entre el DDL versionado y la base desplegada**: según `aidlc-docs/audit.md` y el
     SQL que ejecuta `app-web/src/app/actions.ts:65`, la base real tiene `USUARIO.ROL_GLOBAL` y un
     `USUARIO_AMBITO` sin `ROL` ni `ACTIVO`, así que el rol a migrar puede no estar donde el DDL del
     repositorio dice.
