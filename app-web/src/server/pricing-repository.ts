import "server-only";
import type { Articulo, NivelPrecio } from "@/lib/types";
import { esModoDemo, nombreSql, objetoCalificado, resolverCompania } from "./companies";
import {
  buscarArticuloDemo,
  catalogoDemo,
  nivelesPrecioDemo,
  porcentajeUdfDemo,
  upsertUdfDemo,
} from "./demo-catalog";
import { getPool } from "./db";

/**
 * Repositorio de precios/margen por compania. Enruta cada operacion a la base
 * Softland de la compania activa y usa el MAPA DE OBJETOS SQL configurable por
 * compania (nombre/esquema del SP y de la UDF, y nombres de columnas). En
 * DEMO_MODE usa el catalogo en memoria; en modo real ejecuta consultas y SPs
 * sobre el catalogo de la compania.
 */

export interface ResultadoSpMargen {
  articulo: string;
  margenMinimoPersistido: number | null;
  origenFactor: "EXCEPCION_UDF" | "DEFAULT_10PCT";
}

export async function listarNivelesPrecio(compania: string): Promise<NivelPrecio[]> {
  if (esModoDemo()) return nivelesPrecioDemo(compania);

  const pool = await getPool(compania);
  const tabla = objetoCalificado(compania, "tablaNivelPrecio");
  const q = await pool.request().query(
    `SELECT DISTINCT NP.NIVEL_PRECIO AS codigo
       FROM ${tabla} NP
      WHERE NP.NIVEL_PRECIO IS NOT NULL
      ORDER BY NP.NIVEL_PRECIO`,
  );
  return q.recordset.map((r: Record<string, unknown>) => {
    const codigo = String(r.codigo).trim();
    return { codigo, nombre: codigo };
  });
}

export async function listarCatalogo(compania: string, nivelPrecio?: string): Promise<Articulo[]> {
  if (esModoDemo()) return catalogoDemo(compania);

  const pool = await getPool(compania);
  const ap = objetoCalificado(compania, "tablaArticuloPrecio");
  const art = objetoCalificado(compania, "tablaArticulo");
  const mssql = await import("mssql");
  const request = pool.request();
  let filtroNivel = "";
  if (nivelPrecio?.trim()) {
    request.input("nivelPrecio", mssql.VarChar(50), nivelPrecio.trim());
    filtroNivel = "WHERE AP.NIVEL_PRECIO = @nivelPrecio";
  }
  const q = await request.query(
    `WITH PRECIOS AS
     (
       SELECT AP.ARTICULO AS codigo,
              A.DESCRIPCION AS descripcion,
              CAST(AP.PRECIO AS FLOAT) AS precioLista,
              CAST(A.COSTO_PROM_DOL AS FLOAT) AS costoPromedio,
              AP.NIVEL_PRECIO AS nivelPrecio,
              AP.VERSION AS version,
              A.CATEGORIA AS categoria,
              A.LINEA AS linea,
              A.PROVEEDOR AS proveedor,
              ROW_NUMBER() OVER (PARTITION BY AP.ARTICULO ORDER BY AP.VERSION DESC) AS rn
         FROM ${ap} AP
         INNER JOIN ${art} A ON A.ARTICULO = AP.ARTICULO
         ${filtroNivel}
     )
     SELECT codigo, descripcion, precioLista, costoPromedio, nivelPrecio, version,
            categoria, linea, proveedor
       FROM PRECIOS
      WHERE rn = 1
      ORDER BY codigo`,
  );
  return q.recordset.map((r: Record<string, unknown>) => ({
    codigo: String(r.codigo),
    descripcion: String(r.descripcion ?? ""),
    precioLista: Number(r.precioLista ?? 0),
    costoPromedio: Number(r.costoPromedio ?? 0),
    nivelPrecio: r.nivelPrecio == null ? undefined : String(r.nivelPrecio),
    version: r.version == null ? undefined : Number(r.version),
    categoria: r.categoria == null ? undefined : String(r.categoria),
    linea: r.linea == null ? undefined : String(r.linea),
    proveedor: r.proveedor == null ? undefined : String(r.proveedor),
  }));
}

export async function buscarArticulo(compania: string, codigo: string): Promise<Articulo | undefined> {
  if (esModoDemo()) return buscarArticuloDemo(compania, codigo);

  const pool = await getPool(compania);
  const ap = objetoCalificado(compania, "tablaArticuloPrecio");
  const art = objetoCalificado(compania, "tablaArticulo");
  const mssql = await import("mssql");
  const q = await pool
    .request()
    .input("articulo", mssql.VarChar(20), codigo.trim())
    .query(
      `SELECT TOP (1) AP.ARTICULO AS codigo, A.DESCRIPCION AS descripcion,
              CAST(AP.PRECIO AS FLOAT) AS precioLista,
              CAST(A.COSTO_PROM_DOL AS FLOAT) AS costoPromedio
         FROM ${ap} AP
         INNER JOIN ${art} A ON A.ARTICULO = AP.ARTICULO
        WHERE AP.ARTICULO = @articulo`,
    );
  const r = q.recordset[0];
  if (!r) return undefined;
  return {
    codigo: String(r.codigo),
    descripcion: String(r.descripcion ?? ""),
    precioLista: Number(r.precioLista ?? 0),
    costoPromedio: Number(r.costoPromedio ?? 0),
  };
}

/**
 * Porcentaje de reduccion vigente para el articulo en la UDF de la compania
 * (columna activo = 'S'). Devuelve el PORCENTAJE explicito (10.00) o null.
 * Los nombres de tabla y columnas se toman del mapa configurable por compania.
 */
export async function leerPorcentajeUdf(compania: string, codigo: string): Promise<number | null> {
  if (esModoDemo()) return porcentajeUdfDemo(compania, codigo);

  const pool = await getPool(compania);
  const udf = objetoCalificado(compania, "udfFactorReduccion");
  const colCodigo = nombreSql(compania, "colUdfCodigo");
  const colFactor = nombreSql(compania, "colUdfFactor");
  const colActivo = nombreSql(compania, "colUdfActivo");
  const mssql = await import("mssql");
  const q = await pool
    .request()
    .input("codigo", mssql.VarChar(260), codigo.trim())
    .query(
      `SELECT TOP (1) CAST(U.${colFactor} AS FLOAT) AS porcentaje
         FROM ${udf} U
        WHERE U.${colCodigo} = @codigo AND U.${colActivo} = 'S'
        ORDER BY U.${colFactor} DESC`,
    );
  const r = q.recordset[0];
  return r && r.porcentaje !== null && r.porcentaje !== undefined ? Number(r.porcentaje) : null;
}

/**
 * Llena/actualiza (upsert) la UDF U_FACTOR_REDUCCION_MARGEN de la compania con
 * el PORCENTAJE explicito capturado (10.00 = 10%). Usa el mapa configurable de
 * objeto y columnas. En DEMO_MODE actualiza el catalogo en memoria.
 */
export async function upsertUdf(
  compania: string,
  codigo: string,
  descripcion: string,
  porcentaje: number,
  usuario: string,
): Promise<void> {
  if (esModoDemo()) {
    upsertUdfDemo(compania, codigo, porcentaje);
    return;
  }

  const pool = await getPool(compania);
  const udf = objetoCalificado(compania, "udfFactorReduccion");
  const colCodigo = nombreSql(compania, "colUdfCodigo");
  const colDescrip = nombreSql(compania, "colUdfDescripcion");
  const colFactor = nombreSql(compania, "colUdfFactor");
  const colActivo = nombreSql(compania, "colUdfActivo");
  const mssql = await import("mssql");
  await pool
    .request()
    .input("codigo", mssql.VarChar(260), codigo.trim())
    .input("descrip", mssql.VarChar(260), descripcion)
    .input("factor", mssql.Decimal(18, 2), porcentaje)
    .input("usuario", mssql.VarChar(30), usuario)
    .query(
      `MERGE ${udf} AS T
         USING (SELECT @codigo AS c, @descrip AS d) AS S
            ON T.${colCodigo} = S.c AND T.${colDescrip} = S.d
       WHEN MATCHED THEN
         UPDATE SET T.${colFactor} = @factor, T.${colActivo} = 'S',
                    T.RecordDate = GETDATE(), T.UpdatedBy = @usuario
       WHEN NOT MATCHED THEN
         INSERT (${colCodigo}, ${colDescrip}, ${colFactor}, ${colActivo},
                 NoteExistsFlag, RecordDate, RowPointer, CreatedBy, UpdatedBy, CreateDate)
         VALUES (@codigo, @descrip, @factor, 'S',
                 0, GETDATE(), NEWID(), @usuario, @usuario, GETDATE());`,
    );
}

/**
 * Ejecuta el SP de margen configurado para la compania (por defecto
 * SP_CALCULAR_MARGEN_MINIMO_ARTICULO), con los nombres de parametros del mapa.
 * Solo se invoca al aprobar (Regla de Oro) y fuera de DEMO_MODE.
 */
export async function ejecutarSpMargen(
  compania: string,
  nivelPrecio: string,
  version: number,
  articulo: string | null,
  usuario: string,
): Promise<void> {
  const pool = await getPool(compania);
  const sp = objetoCalificado(compania, "spMargen");
  const cfg = resolverCompania(compania).sql;
  const mssql = await import("mssql");
  await pool
    .request()
    .input(cfg.paramNivelPrecio, mssql.VarChar(50), nivelPrecio)
    .input(cfg.paramVersion, mssql.Int, version)
    .input(cfg.paramArticulo, mssql.VarChar(20), articulo)
    .input(cfg.paramUsuario, mssql.VarChar(50), usuario)
    .execute(sp);
}

/**
 * Ejecuta el SP de gestion de listas con redondeo configurado para la compania
 * (procesos de precio). Solo al aprobar y fuera de DEMO_MODE.
 */
export async function ejecutarSpGestionListas(
  compania: string,
  nivelPrecio: string,
  version: number,
  usuario: string,
): Promise<void> {
  const pool = await getPool(compania);
  const sp = objetoCalificado(compania, "spGestionListas");
  const cfg = resolverCompania(compania).sql;
  const mssql = await import("mssql");
  await pool
    .request()
    .input(cfg.paramNivelPrecio, mssql.VarChar(50), nivelPrecio)
    .input(cfg.paramVersion, mssql.Int, version)
    .input(cfg.paramUsuario, mssql.VarChar(50), usuario)
    .execute(sp);
}
