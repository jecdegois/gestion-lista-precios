# Contrato funcional para procesamiento real

## Paso 1 — Correspondencia por pestaña

Decisiones confirmadas para la implementación de actualizaciones reales después de la aprobación:

| Pestaña | Proceso | Persistencia esperada |
|---|---|---|
| Gestión Global | `FACTOR_PRECIO` | Actualizar `SOFTLANDQA.dbo.GESTION_LISTAS_PRECIOS` donde `NIVEL_PRECIO = LISTA` y `COMPANIA = COMPANIA`. Guardar `FACTOR = Factor` y `VARIACION = Factor * 100`. |
| Actualización Masiva de Precios | `MAYOREOD_MASIVO` | Actualizar `ARTICULO_PRECIO` para los artículos seleccionados, filtrando `NIVEL_PRECIO = Lista`. |
| Descuento por Artículo | `DESCUENTO_LISTA_PRECIO` | Upsert en `[SCHEMA].FACTOR_ARTICULO_LISTA`, resolviendo lista base y versión desde `dbo.GESTION_LISTAS_PRECIOS`; persistir `FACTOR = multiplicador`. |
| Carga Masiva de Margen de Utilidad | `MARGEN_UTILIDAD_MASIVO` | Pendiente de definición funcional. |

## Reglas transversales confirmadas

- Las filas válidas se actualizan aunque existan filas inválidas.
- Las filas inválidas no se actualizan y se conservan como detalle de error.
- Si existen filas válidas e inválidas, la solicitud termina como `PROCESADO_CON_ERRORES`.
- Si todas las filas son inválidas, la solicitud no se procesa; la interfaz debe impedir la aprobación y el backend debe rechazarla nuevamente como medida de seguridad.
- Para las actualizaciones de precio se persiste el precio redondeado comercial.
- Todas las operaciones que dependan de `ARTICULO_PRECIO` usan siempre la versión activa de `VERSION_NIVEL`.
- La operación esperada de `DESCUENTO_LISTA_PRECIO` es actualizar el factor de `FACTOR_ARTICULO_LISTA` por artículo; no actualizar directamente el precio en esta etapa.

## Actualización confirmada: FACTOR_ARTICULO_LISTA

La persistencia de `DESCUENTO_LISTA_PRECIO` se implementa con un único upsert
transaccional para las modalidades manual y Excel. El nivel base y la versión
se resuelven en `dbo.GESTION_LISTAS_PRECIOS` por compañía y nivel solicitado.

El valor almacenado en `FACTOR` es el multiplicador con cuatro decimales
(`DECIMAL(12,4)`), las fechas cubren desde la fecha de operación hasta diez
años después, `ACTIVO` se fija en `'S'` y la observación conserva el código de
la solicitud. La especificación completa está en
`docs/especificacion-factor-articulo-lista.md` y el DDL en
`backend/sql/FACTOR_ARTICULO_LISTA.sql`.

## Pendientes para cerrar el contrato

- `GESTION_LISTAS_PRECIOS` vive en `SOFTLANDQA.dbo`. Su clave es `(COMPANIA, NIVEL_PRECIO, VERSION)`, todos `VARCHAR`. `FACTOR_MULTIPLICADOR` y `VARIACION_PORC` son `DECIMAL`.
- En `GESTION_LISTAS_PRECIOS`, si la clave no existe, la operación termina con error; no se inserta una fila nueva.
- `FACTOR_ARTICULO_LISTA` contiene: `ID_FACTOR_ARTICULO_LISTA BIGINT IDENTITY`, `NIVEL_PRECIO_BASE VARCHAR(50) NOT NULL`, `NIVEL_PRECIO VARCHAR(50) NOT NULL`, `VERSION INT NOT NULL`, `ARTICULO VARCHAR(20) NOT NULL`, `FACTOR DECIMAL(12,4) NOT NULL`, `FECHA_INICIO DATE NOT NULL`, `FECHA_FIN DATE NOT NULL`, `ACTIVO CHAR(1) NOT NULL`, `OBSERVACION VARCHAR(250)`, `FECHA_CREACION DATETIME NOT NULL`, `USUARIO_CREACION VARCHAR(50) NOT NULL`, `FECHA_ULT_MODIF DATETIME`, `USUARIO_ULT_MODIF VARCHAR(50)`, `RecordDate DATETIME NOT NULL`, `RowPointer UNIQUEIDENTIFIER NOT NULL`, `CreatedBy VARCHAR(50) NOT NULL`, `UpdatedBy VARCHAR(50) NOT NULL` y `CreateDate DATETIME NOT NULL`.
- Para `FACTOR_ARTICULO_LISTA`, la búsqueda de actualización usa `(NIVEL_PRECIO, VERSION, ARTICULO, ACTIVO)`. Si no existe una fila activa coincidente, se inserta una nueva.
- `FECHA_INICIO` y `FECHA_FIN` se establecen con la fecha de operación y diez años de vigencia; `ACTIVO` se fija en `'S'`. Las columnas técnicas restantes conservan sus defaults SQL.
- `OBSERVACION` guarda `Solicitud {CODIGO_SOLICITUD}`. En una actualización se llenan `FECHA_ULT_MODIF` y `USUARIO_ULT_MODIF`.
- El campo `FACTOR` se maneja como `DECIMAL(12,4)` para conservar multiplicadores como `1.0740`; `VERSION` se envía como entero.
- `MAYOREOD_MASIVO` actualizará por ahora únicamente `ARTICULO_PRECIO.PRECIO`.
- Para `FACTOR_PRECIO` no se validará de forma independiente `VERSION_NIVEL.ESTADO = 'A'`. La versión se resolverá mediante la relación entre `GESTION_LISTAS_PRECIOS` y `VERSION_NIVEL`, haciendo coincidir `NIVEL_PRECIO` y `VERSION`; las listas de `GESTION_LISTAS_PRECIOS` son las que se consideran operativas.
- Si no se encuentra una relación válida entre ambas tablas para la compañía y lista solicitadas, la ejecución debe fallar con un mensaje indicando que no se consiguió una versión válida para la lista.
- En `FACTOR_PRECIO` las filas del detalle son referenciales del impacto simulado. La ejecución real solo actualiza el factor de la lista en `dbo.GESTION_LISTAS_PRECIOS`; no actualiza `ARTICULO_PRECIO` artículo por artículo. Un SP externo leerá posteriormente ese factor y aplicará los precios.
- En `FACTOR_PRECIO`, si existe al menos una fila válida, se permite actualizar el factor global aunque existan filas inválidas; las inválidas se conservan para reportar `PROCESADO_CON_ERRORES`. Si todas son inválidas, no se actualiza.
- El procesamiento parcial se ejecutará dentro de una única transacción por solicitud.
- Para `DESCUENTO_LISTA_PRECIO`, `NIVEL_PRECIO_BASE` y `VERSION` se resuelven desde `dbo.GESTION_LISTAS_PRECIOS` por compañía y nivel solicitado. La implementación está documentada en `docs/especificacion-factor-articulo-lista.md` y `backend/sql/FACTOR_ARTICULO_LISTA.sql`.
- Definir la persistencia de `MARGEN_UTILIDAD_MASIVO`.
