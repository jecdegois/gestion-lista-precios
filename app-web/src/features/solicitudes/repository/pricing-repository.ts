import "server-only";
import { esFilaMargen, esFilaProcesable, type FilaPrecio, type FilaResultado, type TipoVariacion } from "@/shared/types/domain-types";
import type { Articulo, GestionGlobalLista, NivelPrecio } from "@/shared/types/models";
import { assertEscrituraSoftlandHabilitada, esModoDemo, nombreSql, objetoCalificado, objetoPortal, resolverCompania } from "@/server/companies";
import {
  buscarArticuloDemo,
  catalogoDemo,
  nivelesPrecioDemo,
  porcentajeUdfDemo,
  upsertUdfDemo,
} from "./demo-catalog";
import { getPool, portalDb, softlandDb } from "@/server/db";

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
/**
 * VARIACION_PORC guarda la magnitud SIN signo (10, no -10); el sentido va en TIPO_VARIACION
 * (AUMENTO / DISMINUCION), igual que el resto de filas de GESTION_LISTAS_PRECIOS.
 */
async function actualizarGestionGlobal(
  compania: string,
  lista: string,
  factor: number,
  tipoVariacion: TipoVariacion,
  magnitud: number,
  usuario: string,
): Promise<ResultadoGestionGlobal> {
  const variacion = Number(magnitud.toFixed(8));
  console.info("[GESTION_GLOBAL] Valores recibidos por pricing-repository", {
    compania,
    lista,
    factor,
    tipoVariacion,
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
  if (!Number.isFinite(magnitud) || magnitud < 0) {
    throw new Error("La variación porcentual de Gestión Global no es válida.");
  }
  if (tipoVariacion !== "AUMENTO" && tipoVariacion !== "DISMINUCION") {
    throw new Error("El tipo de variación de Gestión Global no es válido.");
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
           FROM [dbo].[GESTION_LISTAS_PRECIOS] A WITH(NOLOCK)
           INNER JOIN ${versiones} B WITH(NOLOCK)
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
      .input("tipoVariacion", mssql.VarChar(12), tipoVariacion)
      .input("usuario", mssql.VarChar(50), usuario.trim())
      .query(
        `UPDATE A
            SET A.FACTOR_MULTIPLICADOR = @factor,
                A.VARIACION_PORC = @variacion,
                A.TIPO_VARIACION = @tipoVariacion
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
      tipoVariacion,
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

  // Hallazgos de margen incluidos.
  const filasValidas = filas.filter((fila): fila is FilaPrecio => !esFilaMargen(fila) && esFilaProcesable(fila));
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
             FROM ${gestion} A WITH(NOLOCK)
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
           FROM ${target} U WITH(NOLOCK);`,
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

/** Actualiza directamente el precio de los artículos de MAYOREOD en la versión activa. */
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
  const filasValidas = filas.filter((fila): fila is FilaPrecio =>
    !esFilaMargen(fila) && esFilaProcesable(fila),
  );
  if (filasValidas.length === 0) {
    throw new Error("No existen filas válidas para actualizar precios base.");
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
           FROM ${versiones} VN WITH(NOLOCK)
          WHERE VN.NIVEL_PRECIO = @lista
            AND VN.ESTADO = 'A'
          ORDER BY TRY_CONVERT(INT, VN.VERSION) DESC, VN.VERSION DESC;`,
      );
    const version = versionResult.recordset[0]?.version;
    if (version == null || String(version).trim() === "") {
      throw new Error(`No existe una versión activa para la lista '${lista}'.`);
    }

    for (const fila of filasValidas) {
      const precio = Number(fila.validacion.precioPropuesto);
      const articulo = fila.codigo.trim();
      if (!articulo || !Number.isFinite(precio) || precio <= 0) {
        throw new Error(`La fila ${fila.fila} no tiene un artículo o precio válido.`);
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
        throw new Error(`No se encontró ${ap} para el artículo '${articulo}', lista '${lista}' y versión activa '${version}'.`);
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

  // Niveles que tienen al menos una versión activa.
  const db = softlandDb(compania);
  const activos = await db.vERSION_NIVEL.findMany({ where: { ESTADO: "A" }, distinct: ["NIVEL_PRECIO"], select: { NIVEL_PRECIO: true } });
  const niveles = await db.nIVEL_PRECIO.findMany({
    where: { NIVEL_PRECIO: { in: activos.map((v) => v.NIVEL_PRECIO) } },
    distinct: ["NIVEL_PRECIO"],
    select: { NIVEL_PRECIO: true },
    orderBy: { NIVEL_PRECIO: "asc" },
  });
  return niveles.map((n) => {
    const codigo = n.NIVEL_PRECIO.trim();
    return { codigo, nombre: codigo };
  });
}

async function obtenerVersionActiva(compania: string, nivelPrecio: string): Promise<number> {
  const nivel = nivelPrecio.trim();
  if (!nivel) throw new Error("Debe indicar una lista de precio para consultar la versión activa.");
  if (esModoDemo()) return 1;

  const result = await softlandDb(compania).vERSION_NIVEL.findFirst({
    where: { NIVEL_PRECIO: nivel, ESTADO: "A" },
    orderBy: { VERSION: "desc" },
    select: { VERSION: true },
  });
  const version = Number(result?.VERSION);
  if (!Number.isInteger(version)) {
    throw new Error(`No existe una versión activa para la lista '${nivel}'.`);
  }
  return version;
}

/** Lista y parámetros vigentes usados exclusivamente por Gestión Global. */
/** TIPO_VARIACION admite texto o signo: AUMENTO/A/+ y DISMINUCION/DESCUENTO/D/-. */
function normalizarTipoVariacion(valor: unknown): TipoVariacion | null {
  const v = String(valor ?? "").trim().toUpperCase();
  if (v.startsWith("A") || v === "+") return "AUMENTO";
  if (v.startsWith("D") || v === "-") return "DISMINUCION";
  return null;
}

async function listarGestionGlobal(compania: string): Promise<GestionGlobalLista[]> {
  if (esModoDemo()) {
    return nivelesPrecioDemo(compania).map((nivel) => ({
      ...nivel,
      version: "1",
      variacionPorc: 0,
      tipoVariacion: null,
      moneda: null,
      nivelPrecioBase: nivel.codigo,
      monedaBase: null,
      fechaInicio: null,
      fechaFin: null,
      factorMultiplicador: null,
      horasAtras: null,
      exigirFactorConfigurado:    false,
      validarPrecioBajoCosto:     false,
      excepcionesArticulos:       null,
    }));
  }
  const pool = await getPool(compania);
  const mssql = await import("mssql");
  const q = await pool.request()
    .input("compania", mssql.VarChar(20), compania.trim().toUpperCase())
    .query(
      `SELECT A.NIVEL_PRECIO AS codigo,
              A.VERSION AS version,
              A.VARIACION_PORC AS variacionPorc,
              LTRIM(RTRIM(A.TIPO_VARIACION)) AS tipoVariacion,
              LTRIM(RTRIM(A.MONEDA)) AS moneda,
              CONVERT(varchar(10), A.FECHA_INICIO, 23) AS fechaInicio,
              CONVERT(varchar(10), A.FECHA_CORTE, 23) AS fechaFin,
              CAST(A.FACTOR_MULTIPLICADOR AS FLOAT) AS factorMultiplicador,
              A.HORAS_ATRAS AS horasAtras,
              -- Si NIVEL_PRECIO_BASE es NULL o vacío, la lista se toma como su propia base
              COALESCE(NULLIF(LTRIM(RTRIM(A.NIVEL_PRECIO_BASE)), ''), A.NIVEL_PRECIO) AS nivelPrecioBase,
              LTRIM(RTRIM(A.MONEDA_BASE)) AS monedaBase,
              ISNULL(A.EXIGIR_FACTOR_CONFIGURADO, 0)    AS exigirFactorConfigurado,
              ISNULL(A.VALIDAR_PRECIO_BAJO_COSTO, 0)    AS validarPrecioBajoCosto,
              ISNULL(A.EXCEPCIONES_ARTICULOS, 0)        AS excepcionesArticulos
         FROM [dbo].[GESTION_LISTAS_PRECIOS] A WITH(NOLOCK)
        WHERE A.COMPANIA = @compania
        -- Versión más reciente primero: los consumidores buscan por código con .find y
        -- deben obtener la vigente (misma regla TOP 1 DESC que actualizarGestionGlobal).
        ORDER BY A.NIVEL_PRECIO, TRY_CONVERT(INT, A.VERSION) DESC, A.VERSION DESC;`,
    );
  return q.recordset.map((r: Record<string, unknown>) => {
    const codigo = String(r.codigo ?? "").trim();
    return {
      codigo,
      nombre: codigo,
      version: String(r.version ?? "").trim(),
      variacionPorc: r.variacionPorc == null ? null : Number(r.variacionPorc),
      tipoVariacion: normalizarTipoVariacion(r.tipoVariacion),
      moneda: r.moneda == null ? null : String(r.moneda).trim() || null,
      fechaInicio: r.fechaInicio == null ? null : String(r.fechaInicio).trim(),
      fechaFin: r.fechaFin == null ? null : String(r.fechaFin).trim(),
      factorMultiplicador: r.factorMultiplicador == null ? null : Number(r.factorMultiplicador),
      horasAtras: r.horasAtras == null ? null : Number(r.horasAtras),
      // Fallback en TypeScript por si el COALESCE retorna nulo igualmente
      nivelPrecioBase: String(r.nivelPrecioBase ?? codigo).trim() || codigo,
      monedaBase: r.monedaBase == null ? null : String(r.monedaBase).trim() || null,
      exigirFactorConfigurado:    Boolean(r.exigirFactorConfigurado),
      validarPrecioBajoCosto:     Boolean(r.validarPrecioBajoCosto),
      excepcionesArticulos:       r.excepcionesArticulos == null ? null : String(r.excepcionesArticulos),
    };
  })
    .filter((nivel) => nivel.codigo && nivel.version)
    // Solo la versión vigente (primera por el ORDER BY DESC) de cada lista.
    .filter((nivel, i, todas) => todas.findIndex((otra) => otra.codigo === nivel.codigo) === i);
}

/** Por encima de este número de códigos se lee la lista completa (SQL Server admite ~2100 parámetros). */
const MAX_CODIGOS_FILTRO = 2000;

/**
 * Catálogo de una lista. Con `codigos` (validación de filas: Excel / envío) solo trae esos artículos
 * y omite clasificaciones y orden, que el motor de validación no usa.
 */
async function listarCatalogo(compania: string, nivelPrecio: string, codigos?: string[]): Promise<Articulo[]> {
  const nivel = nivelPrecio.trim();
  if (!nivel) throw new Error("Debe indicar una lista de precio para consultar el catálogo.");
  const unicos = codigos ? [...new Set(codigos.map((c) => c.trim()).filter(Boolean))] : undefined;
  if (unicos?.length === 0) return [];
  if (esModoDemo()) {
    const buscados = unicos && new Set(unicos.map((c) => c.toUpperCase()));
    return catalogoDemo(compania)
      .filter((articulo) => !buscados || buscados.has(articulo.codigo.trim().toUpperCase()))
      .map((articulo) => ({ ...articulo, nivelPrecio: nivel, version: 1 }));
  }

  const pool = await getPool(compania);
  const ap = objetoCalificado(compania, "tablaArticuloPrecio");
  const art = objetoCalificado(compania, "tablaArticulo");
  const versiones = objetoCalificado(compania, "tablaVersionNivel");
  const mssql = await import("mssql");
  const request = pool.request().input("nivelPrecio", mssql.VarChar(50), nivel);

  if (unicos) {
    const filtrar = unicos.length <= MAX_CODIGOS_FILTRO;
    if (filtrar) unicos.forEach((codigo, i) => request.input(`c${i}`, mssql.VarChar(50), codigo));
    const q = await request.query(
      `WITH VersionActiva AS
       (
         SELECT VN.NIVEL_PRECIO, MAX(VN.VERSION) AS VERSION
           FROM ${versiones} VN WITH(NOLOCK)
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
              CAST(AP.MARGEN_UTILIDAD_MIN AS FLOAT) AS margenUtilidadMinPorcentaje
         FROM ${ap} AP WITH(NOLOCK)
         INNER JOIN VersionActiva VA
                 ON VA.NIVEL_PRECIO = AP.NIVEL_PRECIO
                AND VA.VERSION = AP.VERSION
         INNER JOIN ${art} A WITH(NOLOCK) ON A.ARTICULO = AP.ARTICULO
        WHERE AP.NIVEL_PRECIO = @nivelPrecio
          ${filtrar ? `AND AP.ARTICULO IN (${unicos.map((_, i) => `@c${i}`).join(", ")})` : ""}`,
    );
    return q.recordset.map(mapearArticulo);
  }

  const q = await request
    .query(
      `WITH VersionActiva AS
       (
         SELECT VN.NIVEL_PRECIO, MAX(VN.VERSION) AS VERSION
           FROM ${versiones} VN WITH(NOLOCK)
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
         FROM ${ap} AP WITH(NOLOCK)
         INNER JOIN VersionActiva VA
                 ON VA.NIVEL_PRECIO = AP.NIVEL_PRECIO
                AND VA.VERSION = AP.VERSION
         INNER JOIN ${art} A WITH(NOLOCK) ON A.ARTICULO = AP.ARTICULO
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C1 WITH(NOLOCK) ON A.CLASIFICACION_1 = C1.CLASIFICACION AND C1.AGRUPACION = 1
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C2 WITH(NOLOCK) ON A.CLASIFICACION_2 = C2.CLASIFICACION AND C2.AGRUPACION = 2
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C3 WITH(NOLOCK) ON A.CLASIFICACION_3 = C3.CLASIFICACION AND C3.AGRUPACION = 3
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C4 WITH(NOLOCK) ON A.CLASIFICACION_4 = C4.CLASIFICACION AND C4.AGRUPACION = 4
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C5 WITH(NOLOCK) ON A.CLASIFICACION_5 = C5.CLASIFICACION AND C5.AGRUPACION = 5
        WHERE AP.NIVEL_PRECIO = @nivelPrecio
        ORDER BY AP.ARTICULO`,
    );
  return q.recordset.map(mapearArticulo);
}

function mapearArticulo(r: Record<string, unknown>): Articulo {
  return {
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
  };
}

export interface PaginaCatalogo {
  items: Articulo[];
  /** Total de artículos que cumplen el filtro (todas las páginas). */
  total: number;
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
  /** Lista padre desde la cual se leen los precios. Si se omite, se usa nivelPrecio (comportamiento legacy). */
  nivelPrecioPadre?: string,
): Promise<PaginaCatalogo> {
  const nivel = nivelPrecio.trim();
  if (!nivel) throw new Error("Debe indicar una lista de precio para consultar el catálogo.");
  // Nivel que se consulta en ARTICULO_PRECIO: si se provee un padre, se usan SUS precios.
  // Si no (o si el padre es igual a la lista), se usa la lista directamente.
  const nivelConsulta = nivelPrecioPadre?.trim() || nivel;
  const pagina = Number.isInteger(offset) && offset >= 0 ? offset : 0;
  const limite = Number.isInteger(maxRecords) ? Math.min(Math.max(maxRecords, 1), 200) : 50;
  const termino = search.trim();

  if (esModoDemo()) {
    const terminoNormalizado = termino.toLowerCase();
    const catalogo = catalogoDemo(compania)
      .map((articulo) => ({ ...articulo, nivelPrecio: nivelConsulta, version: 1 }))
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
      total: catalogo.length,
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
    .input("nivelPrecio", mssql.VarChar(50), nivelConsulta)
    .input("search", mssql.VarChar(200), termino)
    .input("searchLike", mssql.VarChar(202), `%${termino}%`)
    .input("offset", mssql.Int, pagina)
    .input("take", mssql.Int, limite + 1)
    .query(
      `WITH VersionActiva AS
       (
         SELECT VN.NIVEL_PRECIO, MAX(VN.VERSION) AS VERSION
           FROM ${versiones} VN WITH(NOLOCK)
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
              C5.DESCRIPCION AS clasificacion5Descripcion,
              COUNT(1) OVER() AS total
         FROM ${ap} AP WITH(NOLOCK)
         INNER JOIN VersionActiva VA
                 ON VA.NIVEL_PRECIO = AP.NIVEL_PRECIO
                AND VA.VERSION = AP.VERSION
         INNER JOIN ${art} A WITH(NOLOCK) ON A.ARTICULO = AP.ARTICULO
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C1 WITH(NOLOCK) ON A.CLASIFICACION_1 = C1.CLASIFICACION AND C1.AGRUPACION = 1
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C2 WITH(NOLOCK) ON A.CLASIFICACION_2 = C2.CLASIFICACION AND C2.AGRUPACION = 2
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C3 WITH(NOLOCK) ON A.CLASIFICACION_3 = C3.CLASIFICACION AND C3.AGRUPACION = 3
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C4 WITH(NOLOCK) ON A.CLASIFICACION_4 = C4.CLASIFICACION AND C4.AGRUPACION = 4
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C5 WITH(NOLOCK) ON A.CLASIFICACION_5 = C5.CLASIFICACION AND C5.AGRUPACION = 5
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
    // COUNT OVER se calcula antes del OFFSET; una página fuera de rango no trae filas.
    total: Number(q.recordset[0]?.total ?? pagina),
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
           FROM ${versiones} VN WITH(NOLOCK)
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
         FROM ${ap} AP WITH(NOLOCK)
         INNER JOIN VersionActiva VA
                 ON VA.NIVEL_PRECIO = AP.NIVEL_PRECIO
                AND VA.VERSION = AP.VERSION
         INNER JOIN ${art} A WITH(NOLOCK) ON A.ARTICULO = AP.ARTICULO
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C1 WITH(NOLOCK) ON A.CLASIFICACION_1 = C1.CLASIFICACION AND C1.AGRUPACION = 1
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C2 WITH(NOLOCK) ON A.CLASIFICACION_2 = C2.CLASIFICACION AND C2.AGRUPACION = 2
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C3 WITH(NOLOCK) ON A.CLASIFICACION_3 = C3.CLASIFICACION AND C3.AGRUPACION = 3
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C4 WITH(NOLOCK) ON A.CLASIFICACION_4 = C4.CLASIFICACION AND C4.AGRUPACION = 4
         LEFT JOIN ${objetoCalificado(compania, "tablaClasificacion")} C5 WITH(NOLOCK) ON A.CLASIFICACION_5 = C5.CLASIFICACION AND C5.AGRUPACION = 5
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
         FROM ${udf} U WITH(NOLOCK)
        WHERE U.${colArticulo} = @codigo AND U.${colActivo} = 'S'
        ORDER BY U.${colFactor} DESC`,
    );
  const r = q.recordset[0];
  return r && r.porcentaje !== null && r.porcentaje !== undefined ? Number(r.porcentaje) : null;
}

/**
 * Llena/actualiza (upsert) la UDF U_FACTOR_REDUCCION de la compania con el
 * factor normalizado capturado (0.10 = 10%) de TODOS los artículos en una sola
 * transacción: o se aplican todos o ninguno. El siguiente U_CODIGO se lee con
 * UPDLOCK/HOLDLOCK, así dos aprobaciones simultáneas no generan el mismo código.
 * Usa el mapa configurable de objeto y columnas. En DEMO_MODE actualiza el catalogo en memoria.
 */
async function upsertUdfs(
  compania: string,
  items: { codigo: string; porcentaje: number }[],
  descripcion: string,
  usuario: string,
): Promise<void> {
  assertEscrituraSoftlandHabilitada();
  if (esModoDemo()) {
    for (const item of items) upsertUdfDemo(compania, item.codigo, item.porcentaje);
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
  const transaction = new mssql.Transaction(pool);
  let committed = false;

  await transaction.begin();
  try {
    const siguiente = await new mssql.Request(transaction).query(
      `SELECT COALESCE(MAX(TRY_CONVERT(DECIMAL(38, 0), NULLIF(LTRIM(RTRIM(U.${colCodigo})), ''))), 0) + 1 AS siguienteCodigo
         FROM ${udf} U WITH(UPDLOCK, HOLDLOCK)`,
    );
    let siguienteCodigo = BigInt(String(siguiente.recordset[0]?.siguienteCodigo ?? "1"));

    for (const item of items) {
      const result = await new mssql.Request(transaction)
        .input("codigo", mssql.VarChar(256), siguienteCodigo.toString())
        .input("articulo", mssql.VarChar(20), item.codigo.trim())
        .input("descrip", mssql.VarChar(260), descripcion)
        .input("factor", mssql.Decimal(18, 8), item.porcentaje)
        .input("usuario", mssql.VarChar(30), usuario)
        .query(
          `MERGE ${udf} WITH(HOLDLOCK) AS T
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
                     0, GETDATE(), NEWID(), @usuario, @usuario, GETDATE(), @articulo)
           OUTPUT $action AS accion;`,
        );
      if (result.recordset[0]?.accion === "INSERT") siguienteCodigo += BigInt(1);
    }

    await transaction.commit();
    committed = true;
  } catch (error) {
    if (!committed) await transaction.rollback().catch(() => undefined);
    throw error;
  }
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

export interface HallazgoGestionGlobal {
  codigo: string;
  descripcion: string;
  precioActual: number;
  costoPromedio: number;
  margenUtilidadMin: number;
  precioMinimo: number;
  precioPropuesto: number;
  nivelPrecio: string;
  version: number;
}

export interface PaginaHallazgos {
  items: HallazgoGestionGlobal[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
}

/**
 * Artículos cuyo precio propuesto (PRECIO * factor) cae por debajo del precio
 * mínimo (COSTO_PROM_DOL / (1 - MARGEN_UTILIDAD_MIN)). Se calcula completamente
 * en SQL en una sola query, sin loops en Node.js.
 *
 * factor = 1 + (signo * magnitud) / 100
 *   signo = -1 para DISMINUCION, +1 para AUMENTO
 */
async function listarHallazgosGestionGlobal(
  compania: string,
  nivelPrecio: string,
  tipoVariacion: "AUMENTO" | "DISMINUCION",
  magnitud: number,
  offset = 0,
  limit = 100,
  /** Lista padre desde la cual se leen los precios para calcular hallazgos. Si se omite, se usa nivelPrecio. */
  nivelPrecioPadre?: string,
): Promise<PaginaHallazgos> {
  if (esModoDemo()) {
    return { items: [], total: 0, hasMore: false, nextOffset: null };
  }

  // Nivel que se consulta en ARTICULO_PRECIO: precio de la lista padre (o la propia si no tiene padre).
  const nivelConsulta = nivelPrecioPadre?.trim() || nivelPrecio.trim();
  const nivel = nivelPrecio.trim();
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const signo = tipoVariacion === "DISMINUCION" ? -1 : 1;
  const factor = 1 + (signo * magnitud) / 100;

  if (factor <= 0 || factor > 2) {
    return { items: [], total: 0, hasMore: false, nextOffset: null };
  }

  const pool = await getPool(compania);
  const ap = objetoCalificado(compania, "tablaArticuloPrecio");
  const art = objetoCalificado(compania, "tablaArticulo");
  const versiones = objetoCalificado(compania, "tablaVersionNivel");
  const mssql = await import("mssql");

  // Una sola query que identifica hallazgos y pagina directamente en SQL.
  //
  // Condición de hallazgo (replica el engine JS en validarFila):
  //   precioParaValidar < costoMinimo
  // donde:
  //   precioParaValidar = PRECIO * @factor  (aproximación — el engine usa precioRedondeado,
  //                       pero el redondeo comercial de 12 bandas es complejo en SQL;
  //                       la diferencia es mínima y produce falsos positivos acotados)
  //   costoMinimo = COSTO_PROM_DOL / (1 - margenDecimal)
  //   margenDecimal = MARGEN_UTILIDAD_MIN / 100  si está entre 0 y 100
  //                 = 0.20 (fallback global)       si es NULL o 0
  //
  // El fallback de 0.20 replica MARGEN_MINIMO_GLOBAL del engine JS.
  // @nivelPrecio se resuelve contra la lista padre (nivelConsulta) para que los precios
  // base sean los de MAYOREOD (u otra lista padre), no los de la lista hija.
  const baseQuery = `
    WITH VersionActiva AS (
      SELECT VN.NIVEL_PRECIO, MAX(VN.VERSION) AS VERSION
        FROM ${versiones} VN WITH(NOLOCK)
       WHERE VN.ESTADO = 'A' AND VN.NIVEL_PRECIO = @nivelPrecio
       GROUP BY VN.NIVEL_PRECIO
    ),
    Hallazgos AS (
      SELECT
        AP.ARTICULO                                                                            AS codigo,
        A.DESCRIPCION                                                                          AS descripcion,
        CAST(AP.PRECIO            AS FLOAT)                                                    AS precioActual,
        CAST(A.COSTO_PROM_DOL     AS FLOAT)                                                    AS costoPromedio,
        CAST(
          CASE
            WHEN AP.MARGEN_UTILIDAD_MIN > 0 AND AP.MARGEN_UTILIDAD_MIN < 100
            THEN AP.MARGEN_UTILIDAD_MIN / 100.0
            ELSE 0.20
          END AS FLOAT)                                                                        AS margenUtilidadMin,
        CAST(
          A.COSTO_PROM_DOL / NULLIF(1 -
            CASE
              WHEN AP.MARGEN_UTILIDAD_MIN > 0 AND AP.MARGEN_UTILIDAD_MIN < 100
              THEN AP.MARGEN_UTILIDAD_MIN / 100.0
              ELSE 0.20
            END
          , 0) AS FLOAT)                                                                       AS precioMinimo,
        CAST(AP.PRECIO * @factor  AS FLOAT)                                                    AS precioPropuesto,
        AP.NIVEL_PRECIO                                                                        AS nivelPrecio,
        AP.VERSION                                                                             AS version
        FROM ${ap} AP WITH(NOLOCK)
        INNER JOIN VersionActiva VA
                ON VA.NIVEL_PRECIO = AP.NIVEL_PRECIO
               AND VA.VERSION      = AP.VERSION
        INNER JOIN ${art} A WITH(NOLOCK) ON A.ARTICULO = AP.ARTICULO
       WHERE A.COSTO_PROM_DOL IS NOT NULL
         AND A.COSTO_PROM_DOL > 0
         AND AP.PRECIO * @factor < A.COSTO_PROM_DOL / NULLIF(1 -
               CASE
                 WHEN AP.MARGEN_UTILIDAD_MIN > 0 AND AP.MARGEN_UTILIDAD_MIN < 100
                 THEN AP.MARGEN_UTILIDAD_MIN / 100.0
                 ELSE 0.20
               END
             , 0)
    )`;

  const countQ = await pool
    .request()
    .input("nivelPrecio", mssql.VarChar(50), nivelConsulta)
    .input("factor", mssql.Float, factor)
    .query(`${baseQuery} SELECT COUNT(1) AS total FROM Hallazgos`);
  const total: number = countQ.recordset[0]?.total ?? 0;

  const dataQ = await pool
    .request()
    .input("nivelPrecio", mssql.VarChar(50), nivelConsulta)
    .input("factor", mssql.Float, factor)
    .input("offset", mssql.Int, safeOffset)
    .input("limit", mssql.Int, safeLimit)
    .query(
      `${baseQuery}
       SELECT * FROM Hallazgos
        ORDER BY codigo
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );

  const items: HallazgoGestionGlobal[] = dataQ.recordset.map((r: Record<string, unknown>) => ({
    codigo: String(r.codigo),
    descripcion: String(r.descripcion ?? ""),
    precioActual: Number(r.precioActual ?? 0),
    costoPromedio: Number(r.costoPromedio ?? 0),
    margenUtilidadMin: Number(r.margenUtilidadMin ?? 0),
    precioMinimo: Number(r.precioMinimo ?? 0),
    precioPropuesto: Number(r.precioPropuesto ?? 0),
    nivelPrecio: String(r.nivelPrecio ?? nivelConsulta),
    version: Number(r.version ?? 0),
  }));

  const hasMore = safeOffset + items.length < total;
  return {
    items,
    total,
    hasMore,
    nextOffset: hasMore ? safeOffset + items.length : null,
  };
}

// ---------------------------------------------------------------------------
// Funciones BATCHED: aplican SOLICITUD_DETALLE en masa (UPDATE/INSERT con JOIN)
// para solicitudes grandes (10K-40K filas) en lugar de fila por fila.
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

export interface ResultadoBatch {
  total: number;
  exitosos: number;
  fallidos: number;
}

type FilaDetalleAplicable = {
  SKU: string;
  LISTA_PRECIO: string | null;
  FACTOR_APLICADO: unknown;
  PRECIO_SIMULADO: unknown;
  PORCENTAJE_MARGEN: unknown;
};

/**
 * Corre `aplicar` en una transacción de Softland con las filas aplicables (OK/HALLAZGO) de la
 * solicitud cargadas en la tabla temporal #DET. Se leen del portal y se suben por bulk en vez de
 * un JOIN entre bases: el Softland de Costa Rica (MAR/MARQA) está en otro servidor.
 */
async function conDetalleEnSoftland<T>(
  compania: string,
  solicitudId: string,
  aplicar: (request: () => import("mssql").Request) => Promise<T>,
): Promise<T> {
  const filas = await portalDb(compania).$queryRawUnsafe<FilaDetalleAplicable[]>(
    `SELECT D.SKU, D.LISTA_PRECIO, D.FACTOR_APLICADO, D.PRECIO_SIMULADO, D.PORCENTAJE_MARGEN
       FROM ${objetoPortal(compania, "SOLICITUD_DETALLE")} D
       INNER JOIN ${objetoPortal(compania, "SOLICITUD")} S ON S.ID_SOLICITUD = D.ID_SOLICITUD
      WHERE S.CODIGO_SOLICITUD = @P1
        AND D.ESTADO_FILA IN ('OK', 'HALLAZGO')`,
    solicitudId,
  );

  const mssql = await import("mssql");
  const transaction = new mssql.Transaction(await getPool(compania));
  const request = () => new mssql.Request(transaction);
  const decimal = (v: unknown) => (v == null ? null : Number(v));

  await transaction.begin();
  try {
    // batch y no query: una tabla temporal creada dentro de sp_executesql muere al terminar.
    // COLLATE DATABASE_DEFAULT: tempdb puede tener otra intercalación que la base de Softland.
    await request().batch(
      `IF OBJECT_ID('tempdb..#DET') IS NOT NULL DROP TABLE #DET;
       CREATE TABLE #DET (
         SKU               VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
         LISTA_PRECIO      VARCHAR(40) COLLATE DATABASE_DEFAULT NULL,
         FACTOR_APLICADO   DECIMAL(8, 4) NOT NULL,
         PRECIO_SIMULADO   DECIMAL(18, 4) NOT NULL,
         PORCENTAJE_MARGEN DECIMAL(18, 4) NULL
       );`,
    );
    if (filas.length) {
      const tabla = new mssql.Table("#DET");
      tabla.columns.add("SKU", mssql.VarChar(50), { nullable: false });
      tabla.columns.add("LISTA_PRECIO", mssql.VarChar(40), { nullable: true });
      tabla.columns.add("FACTOR_APLICADO", mssql.Decimal(8, 4), { nullable: false });
      tabla.columns.add("PRECIO_SIMULADO", mssql.Decimal(18, 4), { nullable: false });
      tabla.columns.add("PORCENTAJE_MARGEN", mssql.Decimal(18, 4), { nullable: true });
      for (const f of filas) {
        tabla.rows.add(f.SKU, f.LISTA_PRECIO, decimal(f.FACTOR_APLICADO), decimal(f.PRECIO_SIMULADO), decimal(f.PORCENTAJE_MARGEN));
      }
      await request().bulk(tabla);
    }

    const resultado = await aplicar(request);
    // La conexión vuelve al pool: la tabla temporal no debe sobrevivir al commit.
    await request().batch("DROP TABLE #DET;");
    await transaction.commit();
    return resultado;
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

/**
 * Actualiza precios base en ARTICULO_PRECIO leyendo directamente de SOLICITUD_DETALLE.
 * Usa UPDATE con JOIN para actualizar en masa (no fila por fila).
 */
async function actualizarPreciosBaseBatched(
  compania: string,
  solicitudId: string,
  usuario: string,
): Promise<ResultadoBatch> {
  assertEscrituraSoftlandHabilitada();
  if (esModoDemo()) throw new Error("PRECIO_BASE_BATCHED_NO_DISPONIBLE_EN_DEMO");

  const companiaNormalizada = compania.trim().toUpperCase();
  const lista = "MAYOREOD";
  const ap = objetoCalificado(companiaNormalizada, "tablaArticuloPrecio");
  const versiones = objetoCalificado(companiaNormalizada, "tablaVersionNivel");
  const mssql = await import("mssql");

  try {
    return await conDetalleEnSoftland(companiaNormalizada, solicitudId, async (request) => {
      // Obtener versión activa
      const versionResult = await request()
        .input("lista", mssql.VarChar(50), lista)
        .query(
          `SELECT TOP (1) VN.VERSION AS version
             FROM ${versiones} VN WITH(NOLOCK)
            WHERE VN.NIVEL_PRECIO = @lista
              AND VN.ESTADO = 'A'
            ORDER BY TRY_CONVERT(INT, VN.VERSION) DESC, VN.VERSION DESC;`,
        );
      const version = versionResult.recordset[0]?.version;
      if (version == null || String(version).trim() === "") {
        throw new Error(`No existe una versión activa para la lista '${lista}'.`);
      }

      console.info("[PRECIO_BASE_BATCHED] Iniciando UPDATE masivo", {
        solicitudId,
        lista,
        version: String(version),
        tablaArticuloPrecio: ap,
      });

      // UPDATE masivo: actualiza ARTICULO_PRECIO desde #DET con JOIN
      // Esto es MUCHO más eficiente que hacer 10,000 UPDATEs individuales
      const result = await request()
        .input("lista", mssql.VarChar(50), lista)
        .input("version", mssql.Int, Number(version))
        .input("usuario", mssql.VarChar(50), usuario.trim())
        .query(
          `UPDATE AP
              SET AP.PRECIO = D.PRECIO_SIMULADO,
                  AP.FECHA_ULT_MODIF = GETDATE(),
                  AP.USUARIO_ULT_MODIF = @usuario
             FROM ${ap} AP
             INNER JOIN #DET D ON D.SKU = AP.ARTICULO
            WHERE AP.NIVEL_PRECIO = @lista
              AND AP.VERSION = @version
              AND D.PRECIO_SIMULADO > 0;`,
        );

      const exitosos = result.rowsAffected[0] ?? 0;

      // Contar fallidos (filas que no se actualizaron por no existir en ARTICULO_PRECIO o precio inválido)
      const countResult = await request().query<{ n: number }>(`SELECT COUNT(*) AS n FROM #DET`);
      const total = Number(countResult.recordset[0]?.n ?? 0);
      const fallidos = total - exitosos;

      console.info("[PRECIO_BASE_BATCHED] Completado", {
        solicitudId,
        total,
        exitosos,
        fallidos,
        tabla: ap,
      });

      return { total, exitosos, fallidos };
    });
  } catch (error) {
    // Re-lanzar error de BD con mensaje descriptivo para que el servicio lo capture
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error("[PRECIO_BASE_BATCHED] Error de base de datos", { 
      solicitudId, 
      tablaArticuloPrecio: ap,
      error: mensaje,
    });
    throw new Error(`Error al actualizar Precio Base en ${ap}: ${mensaje}`);
  }
}

/**
 * Upsert factores artículo-lista leyendo directamente de SOLICITUD_DETALLE
 * con MERGE masivo para solicitudes de Descuento (DESCUENTO_LISTA_PRECIO).
 * Optimizado para 10K-40K filas usando operaciones bulk en lugar de fila por fila.
 */
async function upsertFactoresArticuloListaBatched(
  compania: string,
  solicitudId: string,
  usuario: string,
): Promise<ResultadoBatch> {
  assertEscrituraSoftlandHabilitada();
  if (esModoDemo()) throw new Error("FACTOR_ARTICULO_LISTA_BATCHED_NO_DISPONIBLE_EN_DEMO");

  const companiaNormalizada = compania.trim().toUpperCase();
  const usuarioNormalizado = usuario.trim();
  const target = objetoCalificado(companiaNormalizada, "tablaFactorArticuloLista");
  // GESTION_LISTAS_PRECIOS siempre está en esquema dbo, no en el esquema de la compañía
  const gestion = `[dbo].[${nombreSql(companiaNormalizada, "tablaGestionListaPrecio")}]`;

  const mssql = await import("mssql");
  const descripcion = `Solicitud ${solicitudId}`;

  console.info("[FACTOR_ARTICULO_LISTA_BATCHED] Iniciando MERGE masivo", {
    solicitudId,
    tablaTarget: target,
  });

  try {
    return await conDetalleEnSoftland(companiaNormalizada, solicitudId, async (request) => {
      // PASO 1: UPDATE masivo de registros existentes
      // Actualiza U_FACTOR para combinaciones (ARTICULO, NIVEL_PRECIO) que ya existen
      const updateResult = await request()
        .input("compania", mssql.VarChar(20), companiaNormalizada)
        .input("descripcion", mssql.VarChar(20), descripcion)
        .input("usuario", mssql.VarChar(50), usuarioNormalizado)
        .query(
          `UPDATE T
              SET T.U_DESCRIP = @descripcion,
                  T.U_FACTOR = D.FACTOR_APLICADO,
                  T.U_VERSION = G.VERSION,
                  T.RecordDate = GETDATE(),
                  T.UpdatedBy = @usuario
             FROM ${target} T
             INNER JOIN #DET D ON D.SKU = T.U_ARTICULO
             INNER JOIN (
               SELECT G1.NIVEL_PRECIO, G1.VERSION
                 FROM ${gestion} G1 WITH(NOLOCK)
                WHERE G1.COMPANIA = @compania
                  AND G1.VERSION = (
                    SELECT MAX(TRY_CONVERT(INT, G2.VERSION))
                      FROM ${gestion} G2 WITH(NOLOCK)
                     WHERE G2.COMPANIA = @compania
                       AND G2.NIVEL_PRECIO = G1.NIVEL_PRECIO
                  )
             ) G ON G.NIVEL_PRECIO = D.LISTA_PRECIO AND G.NIVEL_PRECIO = T.U_NIVEL_PRECIO
            WHERE D.FACTOR_APLICADO > 0
              AND D.FACTOR_APLICADO <= 2
              AND D.LISTA_PRECIO IS NOT NULL
              AND LEN(LTRIM(RTRIM(D.LISTA_PRECIO))) > 0;`,
        );
      const actualizados = updateResult.rowsAffected[0] ?? 0;

      // PASO 2: INSERT masivo de registros nuevos
      // Inserta combinaciones (ARTICULO, NIVEL_PRECIO) que no existen en la tabla target
      // Usa ROW_NUMBER para generar códigos secuenciales; UPDLOCK/HOLDLOCK evita que otra
      // transacción tome los mismos códigos (igual que upsertUdfs).
      const insertResult = await request()
        .input("compania", mssql.VarChar(20), companiaNormalizada)
        .input("descripcion", mssql.VarChar(20), descripcion)
        .input("usuario", mssql.VarChar(50), usuarioNormalizado)
        .query(
          `WITH MaxCodigo AS (
             SELECT COALESCE(MAX(TRY_CONVERT(DECIMAL(38, 0), NULLIF(LTRIM(RTRIM(U_CODIGO)), ''))), 0) AS maxCod
               FROM ${target} WITH(UPDLOCK, HOLDLOCK)
           ),
           NuevosRegistros AS (
             SELECT
               D.SKU AS articulo,
               D.FACTOR_APLICADO AS factor,
               G.NIVEL_PRECIO AS nivelPrecio,
               G.VERSION AS version,
               ROW_NUMBER() OVER (ORDER BY D.SKU, G.NIVEL_PRECIO) AS rn
             FROM #DET D
             INNER JOIN (
               SELECT G1.NIVEL_PRECIO, G1.VERSION
                 FROM ${gestion} G1 WITH(NOLOCK)
                WHERE G1.COMPANIA = @compania
                  AND G1.VERSION = (
                    SELECT MAX(TRY_CONVERT(INT, G2.VERSION))
                      FROM ${gestion} G2 WITH(NOLOCK)
                     WHERE G2.COMPANIA = @compania
                       AND G2.NIVEL_PRECIO = G1.NIVEL_PRECIO
                  )
             ) G ON G.NIVEL_PRECIO = D.LISTA_PRECIO
             LEFT JOIN ${target} T ON T.U_ARTICULO = D.SKU AND T.U_NIVEL_PRECIO = G.NIVEL_PRECIO
            WHERE D.FACTOR_APLICADO > 0
              AND D.FACTOR_APLICADO <= 2
              AND D.LISTA_PRECIO IS NOT NULL
              AND LEN(LTRIM(RTRIM(D.LISTA_PRECIO))) > 0
              AND T.U_ARTICULO IS NULL  -- No existe en target
           )
           INSERT INTO ${target} (
             U_CODIGO, U_DESCRIP, NoteExistsFlag, RecordDate, RowPointer,
             CreatedBy, UpdatedBy, CreateDate, U_ARTICULO, U_FACTOR,
             U_NIVEL_PRECIO, U_VERSION
           )
           SELECT
             CAST(M.maxCod + N.rn AS VARCHAR(10)),
             @descripcion,
             0,
             GETDATE(),
             NEWID(),
             @usuario,
             @usuario,
             GETDATE(),
             N.articulo,
             N.factor,
             N.nivelPrecio,
             N.version
           FROM NuevosRegistros N
           CROSS JOIN MaxCodigo M;`,
        );
      const insertados = insertResult.rowsAffected[0] ?? 0;

      const exitosos = actualizados + insertados;

      // Contar total de filas válidas para calcular fallidos
      const countResult = await request().query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM #DET D
          WHERE D.FACTOR_APLICADO > 0
            AND D.FACTOR_APLICADO <= 2
            AND D.LISTA_PRECIO IS NOT NULL
            AND LEN(LTRIM(RTRIM(D.LISTA_PRECIO))) > 0`,
      );
      const total = Number(countResult.recordset[0]?.n ?? 0);
      const fallidos = Math.max(0, total - exitosos);

      console.info("[FACTOR_ARTICULO_LISTA_BATCHED] Completado", {
        solicitudId,
        total,
        actualizados,
        insertados,
        exitosos,
        fallidos,
      });

      return { total, exitosos, fallidos };
    });
  } catch (error) {
    // Re-lanzar error de BD con mensaje descriptivo para que el servicio lo capture
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error("[FACTOR_ARTICULO_LISTA_BATCHED] Error de base de datos", { 
      solicitudId, 
      tablaTarget: target,
      error: mensaje,
    });
    throw new Error(`Error al actualizar Factor Artículo-Lista en ${target}: ${mensaje}`);
  }
}

/**
 * Upsert UDFs de margen de utilidad leyendo directamente de SOLICITUD_DETALLE
 * con MERGE masivo para solicitudes de Margen (MARGEN_UTILIDAD_MASIVO).
 * Optimizado para 10K-40K filas usando operaciones bulk en lugar de fila por fila.
 */
async function upsertUdfsBatched(
  compania: string,
  solicitudId: string,
  usuario: string,
): Promise<ResultadoBatch> {
  assertEscrituraSoftlandHabilitada();
  if (esModoDemo()) throw new Error("UDF_BATCHED_NO_DISPONIBLE_EN_DEMO");

  const companiaNormalizada = compania.trim().toUpperCase();
  const udf = objetoCalificado(companiaNormalizada, "udfFactorReduccion");
  const colCodigo = nombreSql(companiaNormalizada, "colUdfCodigo");
  const colDescrip = nombreSql(companiaNormalizada, "colUdfDescripcion");
  const colFactor = nombreSql(companiaNormalizada, "colUdfFactor");
  const colActivo = nombreSql(companiaNormalizada, "colUdfActivo");
  const colArticulo = nombreSql(companiaNormalizada, "colUdfArticulo");

  const mssql = await import("mssql");
  const descripcion = `Solicitud ${solicitudId}`;

  console.info("[UDF_BATCHED] Iniciando MERGE masivo", {
    solicitudId,
    tablaUdf: udf,
  });

  try {
    return await conDetalleEnSoftland(companiaNormalizada, solicitudId, async (request) => {
      // PASO 1: UPDATE masivo de registros existentes
      const updateResult = await request()
        .input("descrip", mssql.VarChar(260), descripcion)
        .input("usuario", mssql.VarChar(30), usuario.trim())
        .query(
          `UPDATE U
              SET U.${colDescrip} = @descrip,
                  U.${colFactor} = D.PORCENTAJE_MARGEN,
                  U.${colActivo} = 'S',
                  U.RecordDate = GETDATE(),
                  U.UpdatedBy = @usuario
             FROM ${udf} U
             INNER JOIN #DET D ON D.SKU = U.${colArticulo}
            WHERE D.SKU IS NOT NULL
              AND LEN(LTRIM(RTRIM(D.SKU))) > 0;`,
        );
      const actualizados = updateResult.rowsAffected[0] ?? 0;

      // PASO 2: INSERT masivo de registros nuevos
      // Usa ROW_NUMBER para generar códigos secuenciales; UPDLOCK/HOLDLOCK evita que otra
      // transacción tome los mismos códigos (igual que upsertUdfs).
      const insertResult = await request()
        .input("descrip", mssql.VarChar(260), descripcion)
        .input("usuario", mssql.VarChar(30), usuario.trim())
        .query(
          `WITH MaxCodigo AS (
             SELECT COALESCE(MAX(TRY_CONVERT(DECIMAL(38, 0), NULLIF(LTRIM(RTRIM(${colCodigo})), ''))), 0) AS maxCod
               FROM ${udf} WITH(UPDLOCK, HOLDLOCK)
           ),
           NuevosRegistros AS (
             SELECT
               D.SKU AS articulo,
               COALESCE(D.PORCENTAJE_MARGEN, 0) AS porcentaje,
               ROW_NUMBER() OVER (ORDER BY D.SKU) AS rn
             FROM #DET D
             LEFT JOIN ${udf} U ON U.${colArticulo} = D.SKU
            WHERE D.SKU IS NOT NULL
              AND LEN(LTRIM(RTRIM(D.SKU))) > 0
              AND U.${colArticulo} IS NULL  -- No existe en UDF
           )
           INSERT INTO ${udf} (
             ${colCodigo}, ${colDescrip}, ${colFactor}, ${colActivo},
             NoteExistsFlag, RecordDate, RowPointer, CreatedBy, UpdatedBy, CreateDate,
             ${colArticulo}
           )
           SELECT
             CAST(M.maxCod + N.rn AS VARCHAR(256)),
             @descrip,
             N.porcentaje,
             'S',
             0,
             GETDATE(),
             NEWID(),
             @usuario,
             @usuario,
             GETDATE(),
             N.articulo
           FROM NuevosRegistros N
           CROSS JOIN MaxCodigo M;`,
        );
      const insertados = insertResult.rowsAffected[0] ?? 0;

      const exitosos = actualizados + insertados;

      // Contar total de filas válidas para calcular fallidos
      const countResult = await request().query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM #DET D
          WHERE D.SKU IS NOT NULL
            AND LEN(LTRIM(RTRIM(D.SKU))) > 0`,
      );
      const total = Number(countResult.recordset[0]?.n ?? 0);
      const fallidos = Math.max(0, total - exitosos);

      console.info("[UDF_BATCHED] Completado", {
        solicitudId,
        total,
        actualizados,
        insertados,
        exitosos,
        fallidos,
      });

      return { total, exitosos, fallidos };
    });
  } catch (error) {
    // Re-lanzar error de BD con mensaje descriptivo para que el servicio lo capture
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error("[UDF_BATCHED] Error de base de datos", { 
      solicitudId, 
      tablaUdf: udf,
      error: mensaje,
    });
    throw new Error(`Error al actualizar UDF Margen en ${udf}: ${mensaje}`);
  }
}

export const pricingRepository = {
  listPriceLevels: listarNivelesPrecio,
  activePriceVersion: obtenerVersionActiva,
  listGlobalManagement: listarGestionGlobal,
  listCatalog: listarCatalogo,
  listCatalogPage: listarCatalogoPaginado,
  listFindings: listarHallazgosGestionGlobal,
  findArticle: buscarArticulo,
  updateGlobalManagement: actualizarGestionGlobal,
  upsertArticleListFactors: upsertFactoresArticuloLista,
  updateBasePrices: actualizarPreciosBase,
  readUdfPercentage: leerPorcentajeUdf,
  upsertUdfs,
  runMarginSp: ejecutarSpMargen,
  runListManagementSp: ejecutarSpGestionListas,
  // Funciones BATCHED para solicitudes grandes (10K-40K filas)
  updateBasePricesBatched: actualizarPreciosBaseBatched,
  upsertArticleListFactorsBatched: upsertFactoresArticuloListaBatched,
  upsertUdfsBatched: upsertUdfsBatched,
};
