import "server-only";
import { esFilaMargen, type FilaPrecio, type FilaResultado } from "@/lib/domain-types";
import type { Articulo, GestionGlobalLista, NivelPrecio } from "@/lib/types";
import { assertEscrituraSoftlandHabilitada, esModoDemo, nombreSql, objetoCalificado, resolverCompania } from "@/server/companies";
import {
  buscarArticuloDemo,
  catalogoDemo,
  nivelesPrecioDemo,
  porcentajeUdfDemo,
  upsertUdfDemo,
} from "./demo-catalog";
import { getPool } from "@/server/db";

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

export interface ResultadoFactorArticuloLista {
  insertados: number;
  actualizados: number;
  omitidos: number;
}

/**
 * Actualiza el factor global de una lista. El procesamiento posterior de los
 * precios por artículo pertenece al SP externo que consume esta tabla.
 */
async function actualizarGestionGlobal(
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

/**
 * Persiste los factores de Descuento Artículo - Lista después de una
 * aprobación. Las modalidades manual y Excel llegan al mismo contrato
 * (`solicitud.filas`), por lo que comparten exactamente este upsert.
 */
async function upsertFactoresArticuloLista(
  compania: string,
  solicitudId: string,
  filas: FilaResultado[],
  usuario: string,
): Promise<ResultadoFactorArticuloLista> {
  assertEscrituraSoftlandHabilitada();
  if (esModoDemo()) throw new Error("FACTOR_ARTICULO_LISTA_NO_DISPONIBLE_EN_DEMO");

  const companiaNormalizada = compania.trim().toUpperCase();
  const usuarioNormalizado = usuario.trim();
  if (!companiaNormalizada || !usuarioNormalizado) {
    throw new Error("La compañía y el usuario son obligatorios para guardar factores por artículo.");
  }

  const filasValidas = filas.filter((fila): fila is FilaPrecio => !esFilaMargen(fila) && fila.validacion.valido);
  const filasOmitidas = filas.length - filasValidas.length;
  if (filasValidas.length === 0) {
    throw new Error("No existen filas válidas para guardar en FACTOR_ARTICULO_LISTA.");
  }

  const pool = await getPool(companiaNormalizada);
  const target = objetoCalificado(companiaNormalizada, "tablaFactorArticuloLista");
  const gestion = `[dbo].[${nombreSql(companiaNormalizada, "tablaGestionListaPrecio")}]`;
  const mssql = await import("mssql");
  const transaction = new mssql.Transaction(pool);
  let committed = false;
  let insertados = 0;
  let actualizados = 0;

  await transaction.begin();
  try {
    for (const fila of filasValidas) {
      const nivelPrecioSolicitado = String(fila.listaCodigo ?? fila.lista ?? "").trim();
      const articulo = fila.codigo.trim();
      const factor = Number(fila.multiplicador ?? fila.validacion.multiplicador ?? fila.factorPropuesto);
      const descripcion = `Solicitud ${solicitudId}`;
      if (!nivelPrecioSolicitado || !articulo) {
        throw new Error(`La solicitud ${solicitudId} contiene una fila sin nivel de precio o artículo.`);
      }
      if (!Number.isFinite(factor) || factor <= 0 || factor > 2) {
        throw new Error(`El multiplicador del artículo ${articulo} debe ser mayor que 0 y menor o igual a 2.`);
      }

      const lookup = await new mssql.Request(transaction)
        .input("compania", mssql.VarChar(20), companiaNormalizada)
        .input("nivelPrecio", mssql.VarChar(50), nivelPrecioSolicitado)
        .query(
          `SELECT TOP (1)
                  A.NIVEL_PRECIO_BASE AS nivelPrecioBase,
                  A.NIVEL_PRECIO AS nivelPrecio,
                  TRY_CONVERT(INT, A.VERSION) AS version
             FROM ${gestion} A
            WHERE A.COMPANIA = @compania
              AND A.NIVEL_PRECIO = @nivelPrecio
            ORDER BY TRY_CONVERT(INT, A.VERSION) DESC, A.VERSION DESC;`,
        );
      const maestro = lookup.recordset[0] as Record<string, unknown> | undefined;
      const nivelPrecioBase = String(maestro?.nivelPrecioBase ?? "").trim();
      const nivelPrecio = String(maestro?.nivelPrecio ?? nivelPrecioSolicitado).trim();
      const version = Number(maestro?.version);
      if (!nivelPrecioBase || !nivelPrecio || !Number.isInteger(version)) {
        throw new Error(`No se encontró una relación válida de lista base y versión para '${nivelPrecioSolicitado}' en ${gestion}.`);
      }

      const baseParams = (request: import("mssql").Request) => request
        .input("nivelPrecio", mssql.VarChar(20), nivelPrecio)
        .input("version", mssql.Int, version)
        .input("articulo", mssql.VarChar(20), articulo)
        .input("factor", mssql.Decimal(28, 8), Number(factor.toFixed(8)))
        .input("descripcion", mssql.VarChar(20), descripcion)
        .input("usuario", mssql.VarChar(50), usuarioNormalizado);

      const update = await baseParams(new mssql.Request(transaction)).query(
        `UPDATE T
            SET T.U_DESCRIP = @descripcion,
                T.U_FACTOR = @factor,
                T.U_NIVEL_PRECIO = @nivelPrecio,
                T.U_VERSION = @version,
                T.RecordDate = GETDATE(),
                T.UpdatedBy = @usuario
           FROM ${target} T
          WHERE T.U_NIVEL_PRECIO = @nivelPrecio
            AND T.U_ARTICULO = @articulo;`,
      );

      if ((update.rowsAffected[0] ?? 0) > 0) {
        const filasActualizadas = update.rowsAffected[0] ?? 0;
        actualizados += filasActualizadas;
        console.info("[FACTOR_ARTICULO_LISTA] UPDATE ejecutado", {
          compania: companiaNormalizada,
          tabla: target,
          solicitudId,
          usuario: usuarioNormalizado,
          nivelPrecioBase,
          nivelPrecio,
          version,
          articulo,
          factor: Number(factor.toFixed(4)),
          filasAfectadas: filasActualizadas,
        });
        continue;
      }

      const siguienteCodigo = await new mssql.Request(transaction).query(
        `SELECT CAST(COALESCE(MAX(TRY_CONVERT(DECIMAL(38, 0), NULLIF(LTRIM(RTRIM(U.U_CODIGO)), ''))), 0) + 1 AS VARCHAR(10)) AS siguienteCodigo
           FROM ${target} U;`,
      );
      const codigo = String(siguienteCodigo.recordset[0]?.siguienteCodigo ?? "1");
      if (codigo.length > 10) throw new Error(`No hay espacio disponible para generar U_CODIGO en ${target}.`);

      await baseParams(new mssql.Request(transaction))
        .input("codigo", mssql.VarChar(10), codigo)
        .query(
          `INSERT INTO ${target} (
             U_CODIGO, U_DESCRIP, NoteExistsFlag, RecordDate, RowPointer,
             CreatedBy, UpdatedBy, CreateDate, U_ARTICULO, U_FACTOR,
             U_NIVEL_PRECIO, U_VERSION
           ) VALUES (
             @codigo, @descripcion, 0, GETDATE(), NEWID(),
             @usuario, @usuario, GETDATE(), @articulo, @factor,
             @nivelPrecio, @version
           );`,
        );
      console.info("[FACTOR_ARTICULO_LISTA] INSERT ejecutado", {
        compania: companiaNormalizada,
        tabla: target,
        solicitudId,
        usuario: usuarioNormalizado,
        nivelPrecioBase,
        nivelPrecio,
        version,
        articulo,
        factor: Number(factor.toFixed(4)),
      });
      insertados += 1;
    }

    await transaction.commit();
    committed = true;
    return { insertados, actualizados, omitidos: filasOmitidas };
  } catch (error) {
    if (!committed) await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

/** Actualiza directamente el precio de los artÃ­culos de MAYOREOD en la versiÃ³n activa. */
async function actualizarPreciosBase(
  compania: string,
  solicitudId: string,
  filas: FilaResultado[],
  usuario: string,
): Promise<{ actualizados: number }> {
  assertEscrituraSoftlandHabilitada();
  if (esModoDemo()) throw new Error("PRECIO_BASE_NO_DISPONIBLE_EN_DEMO");

  const companiaNormalizada = compania.trim().toUpperCase();
  const lista = "MAYOREOD";
  const filasValidas = filas.filter((fila): fila is FilaPrecio => !esFilaMargen(fila) && fila.validacion.valido);
  if (filasValidas.length === 0) {
    throw new Error("No existen filas vÃ¡lidas para actualizar precios base.");
  }

  const pool = await getPool(companiaNormalizada);
  const ap = objetoCalificado(companiaNormalizada, "tablaArticuloPrecio");
  const versiones = objetoCalificado(companiaNormalizada, "tablaVersionNivel");
  const mssql = await import("mssql");
  const transaction = new mssql.Transaction(pool);
  let committed = false;
  let actualizados = 0;

  await transaction.begin();
  try {
    const versionResult = await new mssql.Request(transaction)
      .input("lista", mssql.VarChar(50), lista)
      .query(
        `SELECT TOP (1) VN.VERSION AS version
           FROM ${versiones} VN
          WHERE VN.NIVEL_PRECIO = @lista
            AND VN.ESTADO = 'A'
          ORDER BY TRY_CONVERT(INT, VN.VERSION) DESC, VN.VERSION DESC;`,
      );
    const version = versionResult.recordset[0]?.version;
    if (version == null || String(version).trim() === "") {
      throw new Error(`No existe una versiÃ³n activa para la lista '${lista}'.`);
    }

    for (const fila of filasValidas) {
      const precio = Number(fila.validacion.precioPropuesto);
      const articulo = fila.codigo.trim();
      if (!articulo || !Number.isFinite(precio) || precio <= 0) {
        throw new Error(`La fila ${fila.fila} no tiene un artÃ­culo o precio vÃ¡lido.`);
      }

      const result = await new mssql.Request(transaction)
        .input("lista", mssql.VarChar(50), lista)
        .input("version", mssql.Int, Number(version))
        .input("articulo", mssql.VarChar(20), articulo)
        .input("precio", mssql.Decimal(28, 8), precio)
        .input("usuario", mssql.VarChar(50), usuario.trim())
        .query(
          `UPDATE ${ap}
              SET PRECIO = @precio,
                  FECHA_ULT_MODIF = GETDATE(),
                  USUARIO_ULT_MODIF = @usuario
            WHERE NIVEL_PRECIO = @lista
              AND VERSION = @version
              AND ARTICULO = @articulo;`,
        );
      if ((result.rowsAffected[0] ?? 0) !== 1) {
        throw new Error(`No se encontrÃ³ ${ap} para el artÃ­culo '${articulo}', lista '${lista}' y versiÃ³n activa '${version}'.`);
      }
      actualizados += result.rowsAffected[0] ?? 0;
    }

    await transaction.commit();
    committed = true;
    console.info("[PRECIO_BASE] ARTICULO_PRECIO actualizado", {
      solicitudId,
      compania: companiaNormalizada,
      tabla: ap,
      lista,
      version: String(version),
      actualizados,
    });
    return { actualizados };
  } catch (error) {
    if (!committed) await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

async function listarNivelesPrecio(compania: string): Promise<NivelPrecio[]> {
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

async function obtenerVersionActiva(compania: string, nivelPrecio: string): Promise<number> {
  const nivel = nivelPrecio.trim();
  if (!nivel) throw new Error("Debe indicar una lista de precio para consultar la versiÃ³n activa.");
  if (esModoDemo()) return 1;

  const pool = await getPool(compania);
  const versiones = objetoCalificado(compania, "tablaVersionNivel");
  const mssql = await import("mssql");
  const result = await pool.request()
    .input("nivelPrecio", mssql.VarChar(50), nivel)
    .query(
      `SELECT TOP (1) VN.VERSION AS version
         FROM ${versiones} VN
        WHERE VN.NIVEL_PRECIO = @nivelPrecio
          AND VN.ESTADO = 'A'
        ORDER BY TRY_CONVERT(INT, VN.VERSION) DESC, VN.VERSION DESC;`,
    );
  const version = Number(result.recordset[0]?.version);
  if (!Number.isInteger(version)) {
    throw new Error(`No existe una versiÃ³n activa para la lista '${nivel}'.`);
  }
  return version;
}

/** Lista y parámetros vigentes usados exclusivamente por Gestión Global. */
async function listarGestionGlobal(compania: string): Promise<GestionGlobalLista[]> {
  if (esModoDemo()) {
    return nivelesPrecioDemo(compania).map((nivel) => ({ ...nivel, version: "1", variacionPorc: 0 }));
  }
  const pool = await getPool(compania);
  const mssql = await import("mssql");
  const q = await pool.request()
    .input("compania", mssql.VarChar(20), compania.trim().toUpperCase())
    .query(
      `SELECT A.NIVEL_PRECIO AS codigo,
              A.VERSION AS version,
              A.VARIACION_PORC AS variacionPorc
         FROM [dbo].[GESTION_LISTAS_PRECIOS] A
        WHERE A.COMPANIA = @compania
        ORDER BY A.NIVEL_PRECIO, TRY_CONVERT(INT, A.VERSION), A.VERSION;`,
    );
  return q.recordset.map((r: Record<string, unknown>) => ({
    codigo: String(r.codigo ?? "").trim(),
    nombre: String(r.codigo ?? "").trim(),
    version: String(r.version ?? "").trim(),
    variacionPorc: r.variacionPorc == null ? null : Number(r.variacionPorc),
  })).filter((nivel) => nivel.codigo && nivel.version);
}

async function listarCatalogo(compania: string, nivelPrecio: string): Promise<Articulo[]> {
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

async function listarCatalogoPaginado(
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

async function buscarArticulo(compania: string, codigo: string, nivelPrecio: string): Promise<Articulo | undefined> {
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
async function leerPorcentajeUdf(compania: string, codigo: string): Promise<number | null> {
  if (esModoDemo()) return porcentajeUdfDemo(compania, codigo);

  const pool = await getPool(compania);
  const udf = objetoCalificado(compania, "udfFactorReduccion");
  const colFactor = nombreSql(compania, "colUdfFactor");
  const colActivo = nombreSql(compania, "colUdfActivo");
  const colArticulo = nombreSql(compania, "colUdfArticulo");
  const mssql = await import("mssql");
  const q = await pool
    .request()
    .input("codigo", mssql.VarChar(260), codigo.trim())
    .query(
      `SELECT TOP (1) CAST(U.${colFactor} AS FLOAT) AS porcentaje
         FROM ${udf} U
        WHERE U.${colArticulo} = @codigo AND U.${colActivo} = 'S'
        ORDER BY U.${colFactor} DESC`,
    );
  const r = q.recordset[0];
  return r && r.porcentaje !== null && r.porcentaje !== undefined ? Number(r.porcentaje) : null;
}

/**
 * Llena/actualiza (upsert) la UDF U_FACTOR_REDUCCION de la compania con
 * el factor normalizado capturado (0.10 = 10%). Usa el mapa configurable de
 * objeto y columnas. En DEMO_MODE actualiza el catalogo en memoria.
 */
async function upsertUdf(
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
  const colArticulo = nombreSql(compania, "colUdfArticulo");
  const mssql = await import("mssql");
  const siguienteCodigo = await pool
    .request()
    .query(
      `SELECT CAST(COALESCE(MAX(TRY_CONVERT(DECIMAL(38, 0), NULLIF(LTRIM(RTRIM(U.${colCodigo})), ''))), 0) + 1 AS VARCHAR(256)) AS siguienteCodigo
         FROM ${udf} U`,
    );
  const codigoRegistro = String(siguienteCodigo.recordset[0]?.siguienteCodigo ?? "1");
  await pool
    .request()
    .input("codigo", mssql.VarChar(256), codigoRegistro)
    .input("articulo", mssql.VarChar(20), codigo.trim())
    .input("descrip", mssql.VarChar(260), descripcion)
    .input("factor", mssql.Decimal(18, 8), porcentaje)
    .input("usuario", mssql.VarChar(30), usuario)
    .query(
      `MERGE ${udf} AS T
         USING (SELECT @articulo AS articulo, @descrip AS d) AS S
       ON T.${colArticulo} = S.articulo
       WHEN MATCHED THEN
         UPDATE SET T.${colDescrip} = @descrip,
                    T.${colFactor} = @factor, T.${colActivo} = 'S',
                    T.RecordDate = GETDATE(), T.UpdatedBy = @usuario
       WHEN NOT MATCHED THEN
         INSERT (${colCodigo}, ${colDescrip}, ${colFactor}, ${colActivo},
                 NoteExistsFlag, RecordDate, RowPointer, CreatedBy, UpdatedBy, CreateDate,
                 ${colArticulo})
         VALUES (@codigo, @descrip, @factor, 'S',
                 0, GETDATE(), NEWID(), @usuario, @usuario, GETDATE(), @articulo);`,
    );
}

/**
 * Ejecuta el SP de margen configurado para la compania (por defecto
 * SP_CALCULAR_MARGEN_MINIMO), con los nombres de parametros del mapa.
 * Solo se invoca al aprobar (Regla de Oro) y fuera de DEMO_MODE.
 */
async function ejecutarSpMargen(
  compania: string,
  nivelPrecioBase: string,
  version: number,
): Promise<void> {
  assertEscrituraSoftlandHabilitada();
  const pool = await getPool(compania);
  const sp = objetoCalificado(compania, "spMargen");
  const cfg = resolverCompania(compania).sql;
  const mssql = await import("mssql");
  await pool
    .request()
    .input(cfg.paramNivelPrecioBase, mssql.VarChar(50), nivelPrecioBase)
    .input(cfg.paramVersion, mssql.Int, version)
    .input(cfg.paramFactorReduccionGeneral, mssql.Decimal(5, 4), 0.10)
    .input(cfg.paramBatchSize, mssql.Int, 2000)
    .execute(sp);
}

/**
 * Ejecuta el SP de gestion de listas con redondeo configurado para la compania
 * (procesos de precio). Solo al aprobar y fuera de DEMO_MODE.
 */
async function ejecutarSpGestionListas(
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

export const pricingRepository = {
  listPriceLevels: listarNivelesPrecio,
  activePriceVersion: obtenerVersionActiva,
  listGlobalManagement: listarGestionGlobal,
  listCatalog: listarCatalogo,
  listCatalogPage: listarCatalogoPaginado,
  findArticle: buscarArticulo,
  updateGlobalManagement: actualizarGestionGlobal,
  upsertArticleListFactors: upsertFactoresArticuloLista,
  updateBasePrices: actualizarPreciosBase,
  readUdfPercentage: leerPorcentajeUdf,
  upsertUdf,
  runMarginSp: ejecutarSpMargen,
  runListManagementSp: ejecutarSpGestionListas,
};
