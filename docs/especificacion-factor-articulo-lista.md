# Especificación de persistencia: Descuento Artículo - Lista

## Alcance

Las modalidades que generan una solicitud `DESCUENTO_LISTA_PRECIO` comparten la misma persistencia después de la aprobación:

- Captura manual.
- Carga por plantilla Excel.
- Cualquier modalidad futura que produzca el mismo contrato de `solicitud.filas`.

La aplicación no inserta en Softland al simular ni al enviar la solicitud. La escritura se ejecuta únicamente después de una aprobación válida y dentro de una transacción por solicitud.

## Tabla destino

La tabla operativa es `[{SCHEMA}].[FACTOR_ARTICULO_LISTA]`. El DDL asociado está en:

`backend/sql/FACTOR_ARTICULO_LISTA.sql`

La tabla requiere una clave técnica `ID_FACTOR_ARTICULO_LISTA BIGINT IDENTITY`, además de las columnas funcionales y de auditoría indicadas en el requerimiento.

## Mapeo de la solicitud

| Columna destino | Fuente | Regla |
|---|---|---|
| `NIVEL_PRECIO_BASE` | `dbo.GESTION_LISTAS_PRECIOS.NIVEL_PRECIO_BASE` | Se obtiene por compañía y nivel de precio solicitado. |
| `NIVEL_PRECIO` | `dbo.GESTION_LISTAS_PRECIOS.NIVEL_PRECIO` | Se busca con `COMPANIA = {SCHEMA}` y el nivel de la fila de solicitud. |
| `VERSION` | `dbo.GESTION_LISTAS_PRECIOS.VERSION` | Se toma la versión más alta válida para la compañía y el nivel solicitado. |
| `ARTICULO` | `solicitud.filas[].codigo` | Sólo filas válidas. |
| `FACTOR` | `solicitud.filas[].multiplicador` | Se persiste el multiplicador, no el porcentaje capturado. Ejemplo: `7.4%` → `1.0740`. |
| `FECHA_INICIO` | `GETDATE()` convertido a `date` | Fecha de la inserción o actualización. |
| `FECHA_FIN` | `DATEADD(YEAR, 10, GETDATE())` convertido a `date` | Vigencia inicial de diez años. |
| `ACTIVO` | Constante | `'S'`. |
| `OBSERVACION` | ID de solicitud | `Solicitud {CODIGO_SOLICITUD}`. |
| `USUARIO_CREACION` / `CreatedBy` / `UpdatedBy` | Aprobador | Usuario que autoriza la operación. |
| `FECHA_CREACION`, `RecordDate`, `CreateDate`, `RowPointer` | Defaults SQL | Se generan en la base de datos. |

`FECHA_ULT_MODIF` y `USUARIO_ULT_MODIF` se llenan al actualizar una fila activa existente.

## Resolución de lista y versión

Para cada fila válida se consulta la tabla de gestión configurada para la compañía:

```sql
SELECT TOP (1)
       A.NIVEL_PRECIO_BASE,
       A.NIVEL_PRECIO,
       TRY_CONVERT(INT, A.VERSION) AS VERSION
  FROM [dbo].[GESTION_LISTAS_PRECIOS] A
 WHERE A.COMPANIA = @compania
   AND A.NIVEL_PRECIO = @nivelPrecio
 ORDER BY TRY_CONVERT(INT, A.VERSION) DESC, A.VERSION DESC;
```

El nombre de la tabla se configura como `tablaGestionListaPrecio` y su valor por defecto es `GESTION_LISTAS_PRECIOS`.

Si no existe una relación válida de lista base, lista destino o versión, se revierte toda la transacción y la solicitud termina con error de ejecución.

## Semántica de persistencia

La operación es un upsert por:

```text
(NIVEL_PRECIO, VERSION, ARTICULO, ACTIVO = 'S')
```

- Si existe una fila activa, se actualiza factor, lista base, fechas de vigencia y auditoría.
- Si no existe, se inserta una nueva fila.
- Las filas inválidas de la solicitud no se persisten.
- Con filas válidas e inválidas, se persisten las válidas y el resultado termina como `PROCESADO_CON_ERRORES`.
- Si todas son inválidas, la aprobación se rechaza antes de ejecutar.

## Campos requeridos detectados

Se detectó una incompatibilidad entre el DDL recibido y el requerimiento funcional: `FACTOR DECIMAL(12,2)` no permite conservar el multiplicador `1.0740`. El DDL del proyecto usa `DECIMAL(12,4)` y convierte tablas existentes a esa escala.

También se agregó la clave técnica `ID_FACTOR_ARTICULO_LISTA`, necesaria para identificar de forma estable cada fila, y restricciones para factor, estado activo y rango de fechas.

## Validación manual

1. Crear una solicitud manual y otra mediante Excel con el mismo artículo, lista y descuento.
2. Capturar `7.4%` y confirmar en la simulación el multiplicador `1.0740`.
3. Enviar y aprobar la solicitud con un usuario distinto al solicitante.
4. Consultar `[{SCHEMA}].FACTOR_ARTICULO_LISTA` y validar nivel base, nivel destino, versión, artículo, factor, fechas y usuario.
5. Repetir la aprobación sobre el mismo artículo/lista y confirmar que actualiza la fila activa en lugar de duplicarla.
