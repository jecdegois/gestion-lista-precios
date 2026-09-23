# Gestión Masiva de Precios (MV26020) — Portal web Next.js

Aplicación web **full-stack en Next.js (App Router)** que integra la interfaz React/Tailwind y la lógica de servidor (Server Actions + Route Handlers) en un solo proyecto, sin backend separado. Implementa la carga masiva de margen porcentual, el cálculo por artículo con redondeo comercial de 12 bandas y la auditoría, con **arquitectura multiempresa** contra SQL Server (Softland).

## Requisitos

- Node.js 18.18+ (o 20+).
- Opcional: SQL Server con los objetos por compañía (`SP_CALCULAR_MARGEN_MINIMO_ARTICULO`, `U_FACTOR_REDUCCION_MARGEN`, `ARTICULO`, `ARTICULO_PRECIO`).

> En Windows, si `npm` está bloqueado por la política de ejecución de PowerShell, use `npm.cmd` en lugar de `npm`.

## Instalación y ejecución

```bash
cd app-web
npm install
cp .env.example .env.local   # en Windows: copy .env.example .env.local
npm run dev
```

Abra <http://localhost:5000>.

Otros scripts: `npm run build` (producción), `npm start` (servir build), `npm run typecheck` (tsc).

## Modo demo vs. SQL Server real

- **`DEMO_MODE=true`** (por defecto en `.env.example`): la app **no** conecta a SQL Server; usa un catálogo en memoria (`src/server/demo-catalog.ts`). Ideal para probar el portal sin base de datos. En este modo el SP no se ejecuta; el cálculo se realiza con la misma lógica de dominio replicada en TypeScript.
- **`DEMO_MODE=false`**: la app conecta a la base Softland de la compañía activa, lee la UDF `[<schema>].[U_FACTOR_REDUCCION_MARGEN]` y ejecuta el SP `[<schema>].[SP_CALCULAR_MARGEN_MINIMO_ARTICULO]` para persistir `ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN`.

### Configuración multiempresa (`.env.local`)

`COMPANIES_CONFIG` es un JSON (una línea) con la conexión y el esquema por compañía:

```env
COMPANIES_CONFIG={"COFER":{"label":"COFERSA","server":"10.0.0.10","database":"SOFTLAND_COFER","schema":"COFER","user":"app_user","password":"***"}}
DEMO_MODE=false
SQL_ENCRYPT=false
SQL_TRUST_SERVER_CERTIFICATE=true
```

El selector de compañía de la barra superior se llena con las claves de `COMPANIES_CONFIG`. Cada operación se enruta a la base de datos de la compañía seleccionada.

## Paridad con el mockup (flujo completo)

El portal reproduce el mockup `gestion-masiva-precios.html` de forma íntegra:

- **Login SSO** con 7 usuarios (+1 sin permiso), compañía resuelta por dominio de correo (S2/SS). El caso SIN_PERMISO muestra la vista 403.
- **Roles maker-checker**: el Operador crea/simula/envía; el Aprobador revisa y autoriza. La navegación se ajusta al rol.
- **4 procesos** en Nueva Solicitud: Gestión Global, Actualización Masiva de Precios (Lista Base, con confirmación de impacto), Descuento por Artículo (captura manual multi-artículo + carga Excel) y Carga Masiva de Margen (porcentaje de reducción).
- **Bandeja de Aprobación** filtrada por compañía (aislamiento multi-tenant), con bloqueo de autoaprobación.
- **Modal de Revisión multi-fase**: diff (tabla + simulación) → monitoreo (barra de progreso) → resultado (exitosos/errores + log S3).
- **Auditoría** por eventos (SOLICITUD_ENVIADA, SIMULACION_REVISADA, EJECUCION_ENCOLADA, EJECUCION_FINALIZADA, SOLICITUD_RECHAZADA).

### Usuarios de prueba (modo demo)

| Usuario | Rol | Compañía |
|---|---|---|
| Juan Pérez (jperez@sillaca.com) | OPERADOR | SILLACA |
| María Rodríguez (mrodriguez@sillaca.com) | APROBADOR | SILLACA |
| Ana Castro (acastro@cofersa.com) | APROBADOR | COFERSA |
| Diego Vargas (dvargas@cofersa.com) | OPERADOR | COFERSA |

Para ver el maker-checker: entre como Operador de SILLACA, envíe una solicitud; luego cierre sesión y entre como Aprobador de SILLACA (María Rodríguez) para revisarla y procesarla en la Bandeja. Verá la transición En proceso → Procesado y el registro en Auditoría.

## Regla de Oro (integración SQL Server)

Las solicitudes en borrador o **PENDIENTE no tocan la base de datos productiva**. Al **aprobar** la solicitud (Server Action `aprobarSolicitud`), y solo cuando `DEMO_MODE=false`:

- Para **Carga Masiva de Margen**: se llena/actualiza la UDF de factor de reducción (upsert por artículo con el porcentaje capturado) y luego se ejecuta el SP de margen que persiste `ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN`.
- Para **procesos de precio** (Gestión Global, Actualización Masiva, Descuento): se ejecuta el SP de gestión de listas con redondeo.

En `DEMO_MODE=true` todo se simula en memoria con un retardo perceptible, sin conectar a SQL Server.

### Arquitectura de dos esquemas

La persistencia se divide en dos esquemas con responsabilidades independientes. DDL vigente en `backend/sql/portal/01_esquema_y_catalogos.sql` → `02_usuarios_y_ambitos.sql` → `03_solicitudes.sql` → `04_aprobaciones_y_ejecucion.sql` (ejecutar en ese orden; `backend/sql/PORTAL_PRECIOS_Y_OPERACION.sql` quedó obsoleto y solo se conserva como referencia histórica):

- **`[PORTAL_PRECIOS]`** — exclusivo de la app web (multiempresa, un solo destino). Tablas: `COMPANIA`, `LISTA_PRECIO`, `USUARIO`, `USUARIO_AMBITO`, `SOLICITUD_PRECIO`, `SOLICITUD_PRECIO_DETALLE`, `AUDITORIA_EVENTOS` (+ `SEQ_SOLICITUD`). Guarda borradores, solicitudes, staging de líneas, estado maker-checker, decisión de aprobación y auditoría. **No toca Softland.** Se configura con `PORTAL_SCHEMA` y `PORTAL_DB_*`.
- **`[{ESQUEMA_EMPRESA}]`** (COFER, EMP1, EMP2…) — operativo por empresa. Tablas/objetos: `U_FACTOR_REDUCCION_MARGEN`, `V_ARTICULO_PRECIO_COSTO`, `SP_CALCULAR_MARGEN_MINIMO_ARTICULO` y lectura de `ARTICULO_PRECIO`. **Solo se toca al aprobar.**

Ruteo: las consultas de solicitudes/detalle/auditoría apuntan siempre a `[PORTAL_PRECIOS]`; el esquema de empresa se sustituye dinámicamente según la compañía activa. El DDL es parametrizable por SQLCMD (`DB_PORTAL`, `DB_EMPRESA`, `ESQUEMA_EMPRESA`); la sección del portal se ejecuta una vez y la de empresa se repite por compañía.

### Objetos SQL configurables por compañía

Además de la conexión, cada compañía puede mapear sus objetos SQL en el bloque `sql` de `COMPANIES_CONFIG`, por si sus nombres de SP, UDF, tablas, columnas o parámetros difieren. Los valores no especificados usan los defaults (los de `backend/sql/`):

| Clave | Default |
|---|---|
| `spMargen` | `SP_CALCULAR_MARGEN_MINIMO_ARTICULO` |
| `spGestionListas` | `SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO` |
| `udfFactorReduccion` | `U_FACTOR_REDUCCION_MARGEN` |
| `tablaGestionListaPrecio` | `GESTION_LISTAS_PRECIOS` |
| `tablaFactorArticuloLista` | `FACTOR_ARTICULO_LISTA` |
| `tablaArticuloPrecio` / `tablaArticulo` | `ARTICULO_PRECIO` / `ARTICULO` |
| `colUdfCodigo` / `colUdfDescripcion` / `colUdfFactor` / `colUdfActivo` | `U_CODIGO` / `U_DESCRIP` / `U_FACTOR_REDUCCION` / `U_ACTIVO` |
| `paramNivelPrecio` / `paramVersion` / `paramArticulo` / `paramUsuario` | `p_nivel_precio` / `p_version` / `p_articulo` / `p_usuario_ult_modif` |

Todos los objetos se ejecutan calificados con el `schema` de la compañía activa y sobre su base de datos, respetando el enrutamiento multiempresa.

## Reglas de negocio implementadas

- **Porcentaje de reducción**: el usuario ingresa `10`, `20`, `10.5` (rango `[0, 100)`). La app normaliza una sola vez a factor (`10 → 0.10`) y aplica el multiplicador `1 − factor` (`0.90`).
- **UDF real**: `U_FACTOR_REDUCCION_MARGEN` almacena el porcentaje explícito (`10.00`); el SP y la app dividen entre `100.0` al calcular. Fallback `10%` (0.10) si no hay excepción activa (`U_ACTIVO = 'S'`).
- **Redondeo comercial de 12 bandas** (`[0,01; 100.000,00]`), empate al terminal superior; estados `CALCULADO` / `FUERA_DE_RANGO` / `ALERTA_MARGEN`.
- **Validación de margen** sobre el **precio redondeado**; rechazo `MARGEN_MINIMO_NO_CUMPLE` o `PRECIO_FUERA_DE_RANGO`.
- **Plantilla**: exige encabezados `Codigo Articulo` y `Porcentaje Reduccion`; rechaza la columna obsoleta `Factor Reduccion` (en cliente y servidor).
- Los factores de precio (`0.95`, `1.10`) son un contrato distinto y no se ven afectados por la carga de margen.

## Estructura

```
app-web/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx            # página server: carga compañías
│  │  ├─ layout.tsx, globals.css
│  │  ├─ actions.ts          # Server Actions (carga masiva, por artículo, auditoría)
│  │  └─ api/                # Route Handlers: /companias /catalogo /plantilla /auditoria
│  ├─ components/            # Portal, CargaMasiva, PorArticulo, Auditoria (client)
│  ├─ lib/                   # dominio: rounding, margin, margin-rows, types, format
│  └─ server/                # datos: companies, db (mssql), demo-catalog, pricing-repository, audit-store
└─ .env.example
```

## Nota de seguridad (dependencia)

`next` 14.2.x muestra un aviso de CVEs recientes del protocolo RSC (diciembre 2025). Para producción, actualice a la versión parcheada que Vercel publique para la línea que use (14.2.x LTS o 15.x) siguiendo <https://nextjs.org/blog/security-update-2025-12-11>. La actualización es de dependencia y no requiere cambios en el código de este proyecto.

## Actualización Masiva de Precios: criterios del conjunto

La pestaña **Actualización Masiva de Precios** construye el conjunto de artículos a partir de los maestros de Softland:

- Lista/nivel de precio con versión activa.
- `CLASIFICACION_1` — Clasificación 1.
- `CLASIFICACION_2` — Clasificación 2.
- `CLASIFICACION_3` — Marca / Clasificación 3.
- `CLASIFICACION_4` — Grupo de compra / Clasificación 4.
- `CLASIFICACION_5` — BDF / Clasificación 5.

Los cinco criterios se muestran como Dropdowns dependientes. Al seleccionar un criterio se limpian los criterios inferiores y se recalculan las opciones disponibles. La pantalla muestra el número de artículos que coincide con la combinación.

La simulación recibe la lista, criterios y códigos resultantes. El servidor vuelve a resolver el catálogo completo y genera las filas de impacto; no se confía únicamente en el filtro del navegador. El envío conserva los criterios y los códigos materializados junto con las filas de simulación.

### Descripciones de clasificaciones

Las opciones de clasificación de Actualización Masiva se obtienen mediante `CLASIFICACION_1` a `CLASIFICACION_5` de `ARTICULO` y joins a la tabla configurable `CLASIFICACION`, usando `AGRUPACION = 1..5`. El Dropdown conserva el código como `value` y muestra `Código — DESCRIPCION` como etiqueta. Si una descripción no existe, se muestra únicamente el código.
