import "server-only";
import type { Articulo, NivelPrecio } from "@/lib/types";
import { assertEscrituraSoftlandHabilitada, esModoDemo, nombreSql, objetoCalificado, resolverCompania } from "./companies";
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

export interface ResultadoGestionGlobal {
  lista: string;
  version: string;
  factor: number;
}

/**
 * Actualiza el factor global de una lista. El procesamiento posterior de los
 * precios por artículo pertenece al SP externo que consume esta tabla.
 */
export async function actualizarGestionGlobal(
  compania: string,
  lista: string,
  factor: number,
  variacionPorcentaje: number,
  usuario: string,
): Promise<ResultadoGestionGlobal> {
  const variacion = Number(variacionPorcentaje.toFixed(8));
  console.info("[GESTION_GLOBAL] Valores recibidos por pricing-repository", {
    compania,
    lista,
    factor,
    variacionPorcentaje: variacion,
  });
  assertEscrituraSoftlandHabilitada();
  if (esModoDemo()) throw new Error("GESTION_GLOBAL_NO_DISPONIBLE_EN_DEMO");

  const companiaNormalizada = compania.trim().toUpperCase();
  const listaNormalizada = lista.trim();
  if (!companiaNormalizada || !listaNormalizada) {
    throw new Error("La compañía y la lista son obligatorias para Gestión Global.");
  }
  if (!Number.isFinite(factor) || factor <= 0 || factor > 2) {
    throw new Error("El factor de Gestión Global debe ser mayor que 0 y menor o igual a 2.");
  }
  if (!Number.isFinite(variacionPorcentaje)) {
    throw new Error("La variación porcentual de Gestión Global no es válida.");
  }

  const pool = await getPool(companiaNormalizada);
  const versiones = objetoCalificado(companiaNormalizada, "tablaVersionNivel");
  const mssql = await import("mssql");
  const transaction = new mssql.Transaction(pool);
  let committed = false;

  await transaction.begin();
  try {
    const versionResult = await new mssql.Request(transaction)
      .input("compania", mssql.VarChar(20), companiaNormalizada)
      .input("lista", mssql.VarChar(50), listaNormalizada)
      .query(
        `SELECT TOP (1) A.VERSION AS version
           FROM [dbo].[GESTION_LISTAS_PRECIOS] A
           INNER JOIN ${versiones} B
                   ON A.NIVEL_PRECIO = B.NIVEL_PRECIO
                  AND A.VERSION = CONVERT(VARCHAR(50), B.VERSION)
          WHERE A.COMPANIA = @compania
            AND A.NIVEL_PRECIO = @lista
          ORDER BY TRY_CONVERT(INT, A.VERSION) DESC, A.VERSION DESC;`,
      );
    const version = versionResult.recordset[0]?.version;
    if (version == null || String(version).trim() === "") {
      throw new Error(`No se consiguió una versión válida para la lista '${listaNormalizada}'.`);
    }

    const updateResult = await new mssql.Request(transaction)
      .input("compania", mssql.VarChar(20), companiaNormalizada)
      .input("lista", mssql.VarChar(50), listaNormalizada)
      .input("version", mssql.VarChar(50), String(version))
      .input("factor", mssql.Decimal(28, 8), factor)
      .input("variacion", mssql.Decimal(28, 8), variacion)
      .input("usuario", mssql.VarChar(50), usuario.trim())
      .query(
        `UPDATE A
            SET A.FACTOR_MULTIPLICADOR = @factor,
                A.VARIACION_PORC = @variacion
           FROM [dbo].[GESTION_LISTAS_PRECIOS] A
          WHERE A.COMPANIA = @compania
            AND A.NIVEL_PRECIO = @lista
            AND A.VERSION = @version;`,
      );
    console.info("[GESTION_GLOBAL] Resultado del UPDATE de GESTION_LISTAS_PRECIOS", {
      compania: companiaNormalizada,
      lista: listaNormalizada,
      version: String(version),
      factor,
      variacionPorcentaje: variacion,
      filasAfectadas: updateResult.rowsAffected[0] ?? 0,
    });
    if (updateResult.rowsAffected[0] !== 1) {
      throw new Error(`No existe la clave de Gestión Global para compañía '${companiaNormalizada}', lista '${listaNormalizada}' y versión '${version}'.`);
    }

    await transaction.commit();
    committed = true;
    return { lista: listaNormalizada, version: String(version), factor };
  } catch (error) {
    console.error("[GESTION_GLOBAL] Error ejecutando UPDATE de GESTION_LISTAS_PRECIOS", {
      compania: companiaNormalizada,
      lista: listaNormalizada,
      factor,
      variacionPorcentaje: variacion,
      columnaVariacionUsada: "VARIACION_PORC",
      error: error instanceof Error ? error.message : error,
    });
    if (!committed) {
      await transaction.rollback().catch(() => undefined);
    }
    throw error;
  }
}

export async function listarNivelesPrecio(compania: string): Promise<NivelPrecio[]> {
  if (esModoDemo()) return nivelesPrecioDemo(compania);

  const pool = await getPool(compania);
  const tabla = objetoCalificado(compania, "tablaNivelPrecio");
  const versiones = objetoCalificado(compania, "tablaVersionNivel");
  const q = await pool.request().query(
    `SELECT DISTINCT NP.NIVEL_PRECIO AS codigo
       FROM ${tabla} NP
      WHERE NP.NIVEL_PRECIO IS NOT NULL
        AND EXISTS (
              SELECT 1
                FROM ${versiones} VN
               WHERE VN.NIVEL_PRECIO = NP.NIVEL_PRECIO
                 AND VN.ESTADO = 'A'
        )
      ORDER BY NP.NIVEL_PRECIO`,
  );
  return q.recordset.map((r: Record<string, unknown>) => {
    const codigo = String(r.codigo).trim();
    return { codigo, nombre: codigo };
  });
}

export async function listarCatalogo(compania: string, nivelPrecio: string): Promise<Articulo[]> {
  const nivel = nivelPrecio.trim();
  if (!nivel) throw new Error("Debe indicar una lista de precio para consultar el catálogo.");
  if (esModoDemo()) return catalogoDemo(compania).map((articulo) => ({ ...articulo, nivelPrecio: nivel, version: 1 }));

  const pool = await getPool(compania);
  const ap = objetoCalificado(compania, "tablaArticuloPrecio");
  const art = objetoCalificado(compania, "tablaArticulo");
  const versiones = objetoCalificado(compania, "tablaVersionNivel");
  const mssql = await import("mssql");
  const q = await pool
    .request()
    .input("nivelPrecio", mssql.VarChar(50), nivel)
    .query(
      `WITH VersionActiva AS
       (
         SELECT VN.NIVEL_PRECIO, MAX(VN.VERSION) AS VERSION
           FROM ${versiones} VN
          WHERE VN.ESTADO = 'A'
            AND VN.NIVEL_PRECIO = @nivelPrecio
          GROUP BY VN.NIVEL_PRECIO
       )
       SELECT AP.ARTICULO AS codigo,
              A.DESCRIPCION AS descripcion,
              CAST(AP.PRECIO AS FLOAT) AS precioLista,
              CAST(A.COSTO_PROM_DOL AS FLOAT) AS costoPromedio,
              AP.NIVEL_PRECIO AS nivelPrecio,
              AP.VERSION AS version,
              CAST(AP.MARGEN_UTILIDAD_MIN AS FLOAT) AS margenUtilidadMinPorcentaje,
              A.CLASIFICACION_1 AS clasificacion1,
              C1.DESCRIPCION AS clasificacion1Descripcion,
              A.CLASIFICACION_2 AS clasificacion2,
              C2.DESCRIPCION AS clasificacion2Descripcion,
              A.CLASIFICACION_3 AS clasificacion3,
              C3.DESCRIPCION AS clasificacion3Descripcion,
              A.CLASIFICACION_4 AS clasificacion4,
              C4.DESCRIPCION AS clasificacion4Descripcion,
              A.CLASIFICACION_5 AS clasificacion5,
              C5.DESCRIPCION AS clasificacion5Descripcion
         FROM ${ap} AP
         INNER JOIN VersionActiva VA
                 ON VA.NIVEL_PRECIO = AP.NIVEL_PRECIO
                AND VA.VERSION = AP.VERSION
         INNER JOIN ${art} A ON A.ARTICULO = AP.ARTICULO
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C1 ON A.CLASIFICACION_1 = C1.CLASIFICACION AND C1.AGRUPACION = 1
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C2 ON A.CLASIFICACION_2 = C2.CLASIFICACION AND C2.AGRUPACION = 2
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C3 ON A.CLASIFICACION_3 = C3.CLASIFICACION AND C3.AGRUPACION = 3
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C4 ON A.CLASIFICACION_4 = C4.CLASIFICACION AND C4.AGRUPACION = 4
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C5 ON A.CLASIFICACION_5 = C5.CLASIFICACION AND C5.AGRUPACION = 5
        WHERE AP.NIVEL_PRECIO = @nivelPrecio
        ORDER BY AP.ARTICULO`,
    );
  return q.recordset.map((r: Record<string, unknown>) => ({
    codigo: String(r.codigo),
    descripcion: String(r.descripcion ?? ""),
    precioLista: Number(r.precioLista ?? 0),
    costoPromedio: Number(r.costoPromedio ?? 0),
    nivelPrecio: r.nivelPrecio == null ? undefined : String(r.nivelPrecio),
    version: r.version == null ? undefined : Number(r.version),
    margenUtilidadMinPorcentaje: r.margenUtilidadMinPorcentaje == null ? null : Number(r.margenUtilidadMinPorcentaje),
    clasificacion1: r.clasificacion1 == null ? undefined : String(r.clasificacion1),
    clasificacion1Descripcion: r.clasificacion1Descripcion == null ? undefined : String(r.clasificacion1Descripcion),
    clasificacion2: r.clasificacion2 == null ? undefined : String(r.clasificacion2),
    clasificacion2Descripcion: r.clasificacion2Descripcion == null ? undefined : String(r.clasificacion2Descripcion),
    clasificacion3: r.clasificacion3 == null ? undefined : String(r.clasificacion3),
    clasificacion3Descripcion: r.clasificacion3Descripcion == null ? undefined : String(r.clasificacion3Descripcion),
    clasificacion4: r.clasificacion4 == null ? undefined : String(r.clasificacion4),
    clasificacion4Descripcion: r.clasificacion4Descripcion == null ? undefined : String(r.clasificacion4Descripcion),
    clasificacion5: r.clasificacion5 == null ? undefined : String(r.clasificacion5),
    clasificacion5Descripcion: r.clasificacion5Descripcion == null ? undefined : String(r.clasificacion5Descripcion),
  }));
}

export interface PaginaCatalogo {
  items: Articulo[];
  offset: number;
  maxRecords: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export async function listarCatalogoPaginado(
  compania: string,
  nivelPrecio: string,
  search = "",
  offset = 0,
  maxRecords = 50,
): Promise<PaginaCatalogo> {
  const nivel = nivelPrecio.trim();
  if (!nivel) throw new Error("Debe indicar una lista de precio para consultar el catálogo.");
  const pagina = Number.isInteger(offset) && offset >= 0 ? offset : 0;
  const limite = Number.isInteger(maxRecords) ? Math.min(Math.max(maxRecords, 1), 200) : 50;
  const termino = search.trim();

  if (esModoDemo()) {
    const terminoNormalizado = termino.toLowerCase();
    const catalogo = catalogoDemo(compania)
      .map((articulo) => ({ ...articulo, nivelPrecio: nivel, version: 1 }))
      .filter((articulo) =>
        !terminoNormalizado
        || articulo.codigo.toLowerCase().includes(terminoNormalizado)
        || articulo.descripcion.toLowerCase().includes(terminoNormalizado),
      )
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
    const paginaExtendida = catalogo.slice(pagina, pagina + limite + 1);
    const hasMore = paginaExtendida.length > limite;
    return {
      items: paginaExtendida.slice(0, limite),
      offset: pagina,
      maxRecords: limite,
      hasMore,
      nextOffset: hasMore ? pagina + limite : null,
    };
  }

  const pool = await getPool(compania);
  const ap = objetoCalificado(compania, "tablaArticuloPrecio");
  const art = objetoCalificado(compania, "tablaArticulo");
  const versiones = objetoCalificado(compania, "tablaVersionNivel");
  const mssql = await import("mssql");
  const q = await pool
    .request()
    .input("nivelPrecio", mssql.VarChar(50), nivel)
    .input("search", mssql.VarChar(200), termino)
    .input("searchLike", mssql.VarChar(202), `%${termino}%`)
    .input("offset", mssql.Int, pagina)
    .input("take", mssql.Int, limite + 1)
    .query(
      `WITH VersionActiva AS
       (
         SELECT VN.NIVEL_PRECIO, MAX(VN.VERSION) AS VERSION
           FROM ${versiones} VN
          WHERE VN.ESTADO = 'A'
            AND VN.NIVEL_PRECIO = @nivelPrecio
          GROUP BY VN.NIVEL_PRECIO
       )
       SELECT AP.ARTICULO AS codigo,
              A.DESCRIPCION AS descripcion,
              CAST(AP.PRECIO AS FLOAT) AS precioLista,
              CAST(A.COSTO_PROM_DOL AS FLOAT) AS costoPromedio,
              AP.NIVEL_PRECIO AS nivelPrecio,
              AP.VERSION AS version,
              CAST(AP.MARGEN_UTILIDAD_MIN AS FLOAT) AS margenUtilidadMinPorcentaje,
              A.CLASIFICACION_1 AS clasificacion1,
              C1.DESCRIPCION AS clasificacion1Descripcion,
              A.CLASIFICACION_2 AS clasificacion2,
              C2.DESCRIPCION AS clasificacion2Descripcion,
              A.CLASIFICACION_3 AS clasificacion3,
              C3.DESCRIPCION AS clasificacion3Descripcion,
              A.CLASIFICACION_4 AS clasificacion4,
              C4.DESCRIPCION AS clasificacion4Descripcion,
              A.CLASIFICACION_5 AS clasificacion5,
              C5.DESCRIPCION AS clasificacion5Descripcion
         FROM ${ap} AP
         INNER JOIN VersionActiva VA
                 ON VA.NIVEL_PRECIO = AP.NIVEL_PRECIO
                AND VA.VERSION = AP.VERSION
         INNER JOIN ${art} A ON A.ARTICULO = AP.ARTICULO
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C1 ON A.CLASIFICACION_1 = C1.CLASIFICACION AND C1.AGRUPACION = 1
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C2 ON A.CLASIFICACION_2 = C2.CLASIFICACION AND C2.AGRUPACION = 2
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C3 ON A.CLASIFICACION_3 = C3.CLASIFICACION AND C3.AGRUPACION = 3
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C4 ON A.CLASIFICACION_4 = C4.CLASIFICACION AND C4.AGRUPACION = 4
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C5 ON A.CLASIFICACION_5 = C5.CLASIFICACION AND C5.AGRUPACION = 5
        WHERE AP.NIVEL_PRECIO = @nivelPrecio
          AND (@search = '' OR AP.ARTICULO LIKE @searchLike OR A.DESCRIPCION LIKE @searchLike)
        ORDER BY AP.ARTICULO
        OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY`,
    );
  const hasMore = q.recordset.length > limite;
  const items = q.recordset.slice(0, limite).map((r: Record<string, unknown>) => ({
    codigo: String(r.codigo),
    descripcion: String(r.descripcion ?? ""),
    precioLista: Number(r.precioLista ?? 0),
    costoPromedio: Number(r.costoPromedio ?? 0),
    nivelPrecio: r.nivelPrecio == null ? undefined : String(r.nivelPrecio),
    version: r.version == null ? undefined : Number(r.version),
    margenUtilidadMinPorcentaje: r.margenUtilidadMinPorcentaje == null ? null : Number(r.margenUtilidadMinPorcentaje),
    clasificacion1: r.clasificacion1 == null ? undefined : String(r.clasificacion1),
    clasificacion1Descripcion: r.clasificacion1Descripcion == null ? undefined : String(r.clasificacion1Descripcion),
    clasificacion2: r.clasificacion2 == null ? undefined : String(r.clasificacion2),
    clasificacion2Descripcion: r.clasificacion2Descripcion == null ? undefined : String(r.clasificacion2Descripcion),
    clasificacion3: r.clasificacion3 == null ? undefined : String(r.clasificacion3),
    clasificacion3Descripcion: r.clasificacion3Descripcion == null ? undefined : String(r.clasificacion3Descripcion),
    clasificacion4: r.clasificacion4 == null ? undefined : String(r.clasificacion4),
    clasificacion4Descripcion: r.clasificacion4Descripcion == null ? undefined : String(r.clasificacion4Descripcion),
    clasificacion5: r.clasificacion5 == null ? undefined : String(r.clasificacion5),
    clasificacion5Descripcion: r.clasificacion5Descripcion == null ? undefined : String(r.clasificacion5Descripcion),
  }));
  return {
    items,
    offset: pagina,
    maxRecords: limite,
    hasMore,
    nextOffset: hasMore ? pagina + limite : null,
  };
}

export async function buscarArticulo(compania: string, codigo: string, nivelPrecio: string): Promise<Articulo | undefined> {
  const nivel = nivelPrecio.trim();
  if (!nivel) throw new Error("Debe indicar una lista de precio para consultar un artículo.");
  if (esModoDemo()) {
    const articulo = buscarArticuloDemo(compania, codigo);
    return articulo ? { ...articulo, nivelPrecio: nivel, version: 1 } : undefined;
  }

  const pool = await getPool(compania);
  const ap = objetoCalificado(compania, "tablaArticuloPrecio");
  const art = objetoCalificado(compania, "tablaArticulo");
  const versiones = objetoCalificado(compania, "tablaVersionNivel");
  const mssql = await import("mssql");
  const q = await pool
    .request()
    .input("articulo", mssql.VarChar(20), codigo.trim())
    .input("nivelPrecio", mssql.VarChar(50), nivel)
    .query(
      `WITH VersionActiva AS
       (
         SELECT VN.NIVEL_PRECIO, MAX(VN.VERSION) AS VERSION
           FROM ${versiones} VN
          WHERE VN.ESTADO = 'A'
            AND VN.NIVEL_PRECIO = @nivelPrecio
          GROUP BY VN.NIVEL_PRECIO
       )
       SELECT AP.ARTICULO AS codigo, A.DESCRIPCION AS descripcion,
              CAST(AP.PRECIO AS FLOAT) AS precioLista,
              CAST(A.COSTO_PROM_DOL AS FLOAT) AS costoPromedio,
              AP.NIVEL_PRECIO AS nivelPrecio,
              AP.VERSION AS version,
              CAST(AP.MARGEN_UTILIDAD_MIN AS FLOAT) AS margenUtilidadMinPorcentaje
         FROM ${ap} AP
         INNER JOIN VersionActiva VA
                 ON VA.NIVEL_PRECIO = AP.NIVEL_PRECIO
                AND VA.VERSION = AP.VERSION
         INNER JOIN ${art} A ON A.ARTICULO = AP.ARTICULO
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C1 ON A.CLASIFICACION_1 = C1.CLASIFICACION AND C1.AGRUPACION = 1
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C2 ON A.CLASIFICACION_2 = C2.CLASIFICACION AND C2.AGRUPACION = 2
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C3 ON A.CLASIFICACION_3 = C3.CLASIFICACION AND C3.AGRUPACION = 3
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C4 ON A.CLASIFICACION_4 = C4.CLASIFICACION AND C4.AGRUPACION = 4
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C5 ON A.CLASIFICACION_5 = C5.CLASIFICACION AND C5.AGRUPACION = 5
        WHERE AP.ARTICULO = @articulo
          AND AP.NIVEL_PRECIO = @nivelPrecio`,
    );
  const r = q.recordset[0];
  if (!r) return undefined;
  return {
    codigo: String(r.codigo),
    descripcion: String(r.descripcion ?? ""),
    precioLista: Number(r.precioLista ?? 0),
    costoPromedio: Number(r.costoPromedio ?? 0),
    nivelPrecio: r.nivelPrecio == null ? undefined : String(r.nivelPrecio),
    version: r.version == null ? undefined : Number(r.version),
    margenUtilidadMinPorcentaje: r.margenUtilidadMinPorcentaje == null ? null : Number(r.margenUtilidadMinPorcentaje),
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
  assertEscrituraSoftlandHabilitada();
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
  assertEscrituraSoftlandHabilitada();
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
  assertEscrituraSoftlandHabilitada();
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
