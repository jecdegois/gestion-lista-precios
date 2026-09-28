import "server-only";
import type { FilaMargen, FilaPrecio, FilaResultado, Solicitud, ValidacionPrecio } from "@/lib/domain-types";
import { assertEscrituraPortalHabilitada, esModoDemo, objetoPortal } from "@/server/companies";
import { getPortalPool } from "@/server/db";
import {
  agregarSolicitud as demoAgregar,
  actualizarSolicitud as demoActualizar,
  listarSolicitudes as demoListarSolicitudes,
  obtenerSolicitud as demoObtener,
  siguienteSeq as demoSeq,
} from "./demo-store";

/**
 * Repositorio del PORTAL (estado maker-checker): solicitudes y su detalle.
 * Escribe SIEMPRE en la base PORTAL_PRECIOS, esquema de la empresa (no toca Softland). La
 * auditoría vive en `features/auditoria/repository/audit-repository.ts`.
 *
 * En DEMO_MODE usa el store en memoria (demo-store); en modo real persiste
 * en las tablas del esquema del portal. Toda la API es async para servir a
 * ambos modos de forma uniforme.
 */

async function listarSolicitudes(compania: string): Promise<Solicitud[]> {
  const companiaNormalizada = compania.trim().toUpperCase();
  if (esModoDemo()) {
    return demoListarSolicitudes().filter((solicitud) => !companiaNormalizada || solicitud.compania === companiaNormalizada);
  }

  const pool = await getPortalPool();
  const sp = objetoPortal(companiaNormalizada, "SOLICITUD");
  const spd = objetoPortal(companiaNormalizada, "SOLICITUD_DETALLE");
  const mssql = await import("mssql");
  
  // Obtener cabeceras de solicitudes
  const cab = companiaNormalizada
    ? await pool
      .request()
      .input("comp", mssql.VarChar(20), companiaNormalizada)
      .query(`SELECT * FROM ${sp} WITH(NOLOCK) WHERE COMPANIA = @comp ORDER BY COALESCE(FECHA_CREACION, FECHA_ENVIO) DESC`)
    : await pool.request().query(`SELECT * FROM ${sp} WITH(NOLOCK) ORDER BY COALESCE(FECHA_CREACION, FECHA_ENVIO) DESC`);
  
  // Obtener detalles - join siempre necesario para mapear filas a solicitudes
  const detRequest = pool.request();
  const detQuery = companiaNormalizada
    ? (detRequest.input("comp", mssql.VarChar(20), companiaNormalizada),
       `SELECT D.* FROM ${spd} D WITH(NOLOCK) INNER JOIN ${sp} S WITH(NOLOCK) ON S.ID_SOLICITUD = D.ID_SOLICITUD WHERE S.COMPANIA = @comp`)
    : `SELECT D.* FROM ${spd} D WITH(NOLOCK) ORDER BY D.ID_SOLICITUD, D.ID_DETALLE`;
  
  const det = await detRequest.query(detQuery);

  return cab.recordset.map((r: Record<string, unknown>) =>
    mapSolicitud(r, det.recordset.filter((d: Record<string, unknown>) => d.ID_SOLICITUD === r.ID_SOLICITUD)),    
  );
}

async function obtenerSolicitud(compania: string, codigo: string): Promise<Solicitud | undefined> {
  if (esModoDemo()) return demoObtener(codigo);
  const pool = await getPortalPool();
  const sp = objetoPortal(compania, "SOLICITUD");
  const spd = objetoPortal(compania, "SOLICITUD_DETALLE");
  const mssql = await import("mssql");
  const cab = await pool.request().input("cod", mssql.VarChar(20), codigo).query(`SELECT * FROM ${sp} WITH(NOLOCK) WHERE CODIGO_SOLICITUD = @cod`);
  const r = cab.recordset[0];
  if (!r) return undefined;
  const idSolicitud = enteroSeguro(r.ID_SOLICITUD, "ID_SOLICITUD de la solicitud");
  const det = await pool
    .request()
    .input("idSolicitud", mssql.Int, idSolicitud)
    .query(`SELECT D.* FROM ${spd} D WITH(NOLOCK) WHERE D.ID_SOLICITUD = @idSolicitud ORDER BY D.ID_DETALLE`);
  return mapSolicitud(r, det.recordset);
}

async function siguienteCodigoSolicitud(compania: string): Promise<string> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) return "SOL-" + (10450 + demoSeq());
  const pool = await getPortalPool();
  const q = await pool.request().query(`SELECT NEXT VALUE FOR ${objetoPortal(compania, "SEQ_SOLICITUD")} AS n`);
  return "SOL-" + q.recordset[0].n;
}

async function agregarSolicitud(s: Solicitud): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) {
    demoAgregar(s);
    return;
  }
  const pool = await getPortalPool();
  const sp = objetoPortal(s.compania, "SOLICITUD");
  const spd = objetoPortal(s.compania, "SOLICITUD_DETALLE");
  const mssql = await import("mssql");
  const lista = String(s.parametros.nivelPrecio ?? s.parametros.listaBase ?? s.parametros.nivel ?? "").trim();  
  const req = pool
    .request()
    .input("cod", mssql.VarChar(20), s.id)
    .input("comp", mssql.VarChar(20), s.compania)
    .input("factor", mssql.VarChar(20), s.parametros.factor)
    .input("proceso", mssql.VarChar(30), s.proceso)
    .input("mod", mssql.VarChar(10), s.modalidad)
    .input("lista", mssql.VarChar(30), lista || null)
    // Los usuarios viven en Postgres; la FK nullable a USUARIO (tabla heredada) queda en NULL.
    .input("idUsuarioSolicitante", mssql.Int, null)
    .input("email", mssql.VarChar(120), s.solicitanteEmail)
    .input("nombre", mssql.VarChar(120), s.solicitanteNombre)
    .input("params", mssql.NVarChar(mssql.MAX), JSON.stringify({ ...s.parametros, filas: s.filas }))
    .input("archNom", mssql.VarChar(260), s.archivoNombre)
    .input("archS3", mssql.VarChar(400), s.archivoS3Key)
    .input("estado", mssql.VarChar(25), s.estado ?? "PENDIENTE");
  const ins = await req.query(
    `INSERT INTO ${sp} (CODIGO_SOLICITUD, COMPANIA, PROCESO, TIPO_PROCESO, MODALIDAD, LISTA_PRECIO, ID_USUARIO_SOLICITANTE,
                        SOLICITANTE_EMAIL, SOLICITANTE_NOMBRE, ESTADO, PARAMETROS_JSON,
                        ARCHIVO_NOMBRE, ARCHIVO_S3_KEY)
     OUTPUT INSERTED.ID_SOLICITUD
     VALUES (@cod,@comp,@proceso,@proceso,@mod,@lista,@idUsuarioSolicitante,@email,@nombre,@estado,@params,
             @archNom,@archS3);`,
  );
  const idSolicitud = enteroSeguro(ins.recordset[0]?.ID_SOLICITUD, "ID_SOLICITUD generado");
  for (const f of s.filas) {
    await insertarDetalle(pool, spd, idSolicitud, f, s.proceso);
  }
}

async function actualizarSolicitud(compania: string, codigo: string, patch: Partial<Solicitud>): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) {
    demoActualizar(codigo, patch);
    return;
  }
  const pool = await getPortalPool();
  const sp = objetoPortal(compania, "SOLICITUD");
  const mssql = await import("mssql");
  const sets: string[] = ["FECHA_ULT_ESTADO = GETDATE()"];
  const req = pool.request().input("cod", mssql.VarChar(20), codigo);
  if (patch.estado !== undefined) { sets.push("ESTADO = @estado"); req.input("estado", mssql.VarChar(25), patch.estado); }
  if (patch.motivoRechazo !== undefined) { sets.push("MOTIVO_RECHAZO = @motivo"); req.input("motivo", mssql.VarChar(500), patch.motivoRechazo); }
  if (patch.idProcesoSP !== undefined) { sets.push("ID_PROCESO_SP = @proc"); req.input("proc", mssql.VarChar(30), patch.idProcesoSP); }
  if (patch.autorizadoPor !== undefined) { sets.push("APROBADOR_NOMBRE = @apn"); req.input("apn", mssql.VarChar(120), patch.autorizadoPor); }
  if (patch.autorizadoPorEmail !== undefined) { sets.push("APROBADOR_EMAIL = @ape"); req.input("ape", mssql.VarChar(120), patch.autorizadoPorEmail); }
  if (patch.resultado !== undefined && patch.resultado) {
    sets.push("TOTAL_REGISTROS = @tot", "EXITOSOS = @ex", "FALLIDOS = @fa", "LOG_S3_KEY = @log");
    req.input("tot", mssql.Int, patch.resultado.totalLote);
    req.input("ex", mssql.Int, patch.resultado.exitosos);
    req.input("fa", mssql.Int, patch.resultado.fallidos);
    req.input("log", mssql.VarChar(400), patch.resultado.logS3Key);
  }
  await req.query(`UPDATE ${sp} SET ${sets.join(", ")} WHERE CODIGO_SOLICITUD = @cod;`);
}

/** Guarda el error del procesamiento en las líneas de la solicitud. */
async function actualizarMensajeErrorDetalles(compania: string, codigo: string, mensaje: string): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) return;
  const pool = await getPortalPool();
  const sp = objetoPortal(compania, "SOLICITUD");
  const spd = objetoPortal(compania, "SOLICITUD_DETALLE");
  const mssql = await import("mssql");
  const solicitud = await pool.request()
    .input("cod", mssql.VarChar(20), codigo)
    .query(`SELECT ID_SOLICITUD FROM ${sp} WITH(NOLOCK) WHERE CODIGO_SOLICITUD = @cod`);
  const idSolicitud = solicitud.recordset[0]?.ID_SOLICITUD;
  if (idSolicitud == null) return;
  await pool.request()
    .input("idSolicitud", mssql.Int, idSolicitud)
    .input("mensaje", mssql.VarChar(400), mensaje.slice(0, 400))
    .query(`UPDATE ${spd} SET MENSAJE_ERROR = @mensaje WHERE ID_SOLICITUD = @idSolicitud`);
}

/** Marca como aplicado el factor solicitado únicamente en filas exitosas. */
async function actualizarFactorAplicadoDetalles(compania: string, codigo: string): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) return;
  const pool = await getPortalPool();
  const sp = objetoPortal(compania, "SOLICITUD");
  const spd = objetoPortal(compania, "SOLICITUD_DETALLE");
  const mssql = await import("mssql");
  const solicitud = await pool.request()
    .input("cod", mssql.VarChar(20), codigo)
    .query(`SELECT ID_SOLICITUD FROM ${sp} WITH(NOLOCK) WHERE CODIGO_SOLICITUD = @cod`);
  const idSolicitud = solicitud.recordset[0]?.ID_SOLICITUD;
  if (idSolicitud == null) return;
  await pool.request()
    .input("idSolicitud", mssql.Int, idSolicitud)
    .query(`
      UPDATE D
         SET D.FACTOR_APLICADO = D.FACTOR_SOLICITADO
        FROM ${spd} D
       WHERE D.ID_SOLICITUD = @idSolicitud
         AND UPPER(LTRIM(RTRIM(COALESCE(D.ESTADO_FILA, '')))) IN ('VALIDO','OK','S','SI','1')
         AND NULLIF(LTRIM(RTRIM(COALESCE(D.MENSAJE_ERROR, ''))), '') IS NULL;
    `);
}
// ---------------------------------------------------------------------------
// Helpers de mapeo (SQL real)
// ---------------------------------------------------------------------------
type SqlPool = Awaited<ReturnType<typeof getPortalPool>>;

async function insertarDetalle(
  pool: SqlPool,
  spd: string,
  idSolicitud: number,
  f: FilaResultado,
  proceso: Solicitud["proceso"],
): Promise<void> {
  const mssql = await import("mssql");
  const v = f.validacion;
  const numero = (valor: unknown): number | null =>
    typeof valor === "number" && Number.isFinite(valor) ? valor : null;
  const esMargen = Object.prototype.hasOwnProperty.call(v, "factorReduccion");
  const validacion = v as FilaMargen["validacion"] | FilaPrecio["validacion"];
  const banda = validacion.bandaRedondeo;
  const filaMargen = esMargen ? f as FilaMargen : null;
  const filaPrecio = !esMargen ? f as FilaPrecio : null;
  const vMargen = esMargen ? filaMargen!.validacion : null;
  const vPrecio = !esMargen ? filaPrecio!.validacion : null;

  await pool
    .request()
    .input("sku", mssql.VarChar(20), f.codigo || "SIN_CODIGO")
    .input("descripcion", mssql.VarChar(200), f.descripcion || "")
    .input("precioActual", mssql.Decimal(28, 8), numero(v.precioActual) ?? 0)
    .input("costo", mssql.Decimal(28, 8), numero(v.costo) ?? 0)
    // El procesador externo todavía no aplica el precio por fila en este
    // flujo; por eso el valor inicial y el valor visible al cerrar queda en 0.
    // El esquema real de SOLICITUD_DETALLE exige FACTOR_APLICADO. Para
    // Precio Base no aplica un factor, por lo que 1.000000 representa el
    // multiplicador neutro; el precio absoluto viaja en PRECIO_SIMULADO.
    .input("factorAplicado", mssql.Decimal(9, 6), numero((f as FilaPrecio | FilaMargen).factorAplicado) ?? 1)
    .input(
      "precioSimulado",
      mssql.Decimal(28, 8),
      numero(proceso === "MAYOREOD_MASIVO" ? v.precioPropuesto : v.precioRedondeado ?? v.precioPropuesto) ?? 0,
    )
    .input(
      "porcentajeMargen",
      mssql.Decimal(9, 6),
      esMargen ? filaMargen?.porcentajeReduccion ?? 0 : v.margenMinimo ?? 0,
    )
    // CK_PP_SOLDET_ESTADO admite OK | ERROR | BAJO_COSTO | MARGEN_NEGATIVO; el motivo va en CAUSA.
    .input("estadoFila", mssql.VarChar(20), v.valido ? "OK" : "ERROR")
    .input("mensajeError", mssql.VarChar(400), (f as FilaPrecio | FilaMargen).mensajeError ?? (!v.valido ? v.causa ?? "Error no identificado" : null))
    .input("idSolicitud", mssql.Int, idSolicitud)
    // FACTOR_SOLICITADO representa el multiplicador persistido, no el
    // porcentaje capturado. El porcentaje queda en PARAMETROS_JSON.
    .input("factorSolicitado", mssql.Decimal(9, 6), numero("multiplicador" in f ? f.multiplicador : null) ?? numero(v.factorPropuesto) ?? 1)
    // LISTA_PRECIO es el origen del valor que se muestra en el detalle. Para
    // descuento por artículo se guarda el código de lista de la fila.
    .input("listaPrecio", mssql.VarChar(400), ("listaCodigo" in f ? f.listaCodigo : null) ?? f.lista ?? "")
    .input("causa", mssql.VarChar(400), v.causa ?? "")
    .query(
      `INSERT INTO ${spd} (
         SKU, DESCRIPCION, PRECIO_ACTUAL, COSTO, FACTOR_APLICADO,
         PRECIO_SIMULADO, PORCENTAJE_MARGEN, ESTADO_FILA, MENSAJE_ERROR,
         ID_SOLICITUD, FACTOR_SOLICITADO, LISTA_PRECIO, CAUSA
       ) VALUES (
         @sku, @descripcion, @precioActual, @costo, @factorAplicado,
         @precioSimulado, @porcentajeMargen, @estadoFila, @mensajeError,
         @idSolicitud, @factorSolicitado, @listaPrecio, @causa
       );`,
    );
}

function enteroSeguro(valor: unknown, etiqueta: string): number {
  const id = typeof valor === "number" ? valor : Number.parseInt(String(valor), 10);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error(`${etiqueta} debe ser un entero positivo.`);
  }
  return id;
}

function textoPrimero(...valores: unknown[]): string | undefined {
  return valores
    .map((valor) => valor == null ? undefined : String(valor))
    .find((valor) => Boolean(valor?.trim()));
}

function mapSolicitud(r: Record<string, unknown>, detalle: Record<string, unknown>[]): Solicitud {
  let parametros = {};
  try {
    parametros = r.PARAMETROS_JSON ? JSON.parse(String(r.PARAMETROS_JSON)) : {};
  } catch {
    parametros = {};
  }
  const lista = textoPrimero(r.LISTA_PRECIO, r.LISTA, r.NIVEL_PRECIO, (parametros as Record<string, unknown>).nivelPrecio, (parametros as Record<string, unknown>).listaBase) ?? "";
  return {
    id: String(r.CODIGO_SOLICITUD ?? r.ID_PROCESO),
    proceso: r.PROCESO as Solicitud["proceso"],
    modalidad: r.MODALIDAD as Solicitud["modalidad"],
    compania: String(r.COMPANIA),
    lista,
    solicitanteNombre: String(r.SOLICITANTE_NOMBRE),
    solicitanteEmail: String(r.SOLICITANTE_EMAIL),
    idpOperador: null,
    parametros,
    filas: detalle.map((d) => mapDetalleFila(d, r.PROCESO as Solicitud["proceso"], lista)),
    archivoNombre: (r.ARCHIVO_NOMBRE as string) ?? null,
    archivoS3Key: (r.ARCHIVO_S3_KEY as string) ?? null,
    fechaEnvio: (() => {
      const v = r.FECHA_CREACION ?? r.FECHA_ENVIO;
      if (!v) return "—";
      const d = v instanceof Date ? v : new Date(v as string);
      return isNaN(d.getTime()) ? "—" : d.toLocaleString("es-CR", { hour12: false });
    })(),
    fechaCreacion: (() => {
      const v = r.FECHA_CREACION ?? r.FECHA_ENVIO;
      if (!v) return undefined;
      const d = v instanceof Date ? v : new Date(v as string);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    })(),
    estado: r.ESTADO as Solicitud["estado"],
    motivoRechazo: (r.MOTIVO_RECHAZO as string) ?? null,
    idProcesoSP: (r.ID_PROCESO_SP as string) ?? null,
    autorizadoPor: (r.APROBADOR_NOMBRE as string) ?? undefined,
    autorizadoPorEmail: (r.APROBADOR_EMAIL as string) ?? undefined,
  };
}

function mapDetalleFila(d: Record<string, unknown>, proceso?: Solicitud["proceso"], listaSolicitud = ""): FilaResultado {
  const numero = (valor: unknown): number | null => {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
    if (typeof valor === "string" && valor.trim() !== "") {
      const convertido = Number(valor);
      return Number.isFinite(convertido) ? convertido : null;
    }
    return null;
  };
  const texto = (valor: unknown): string | undefined => valor == null ? undefined : String(valor);
  const textoNoVacio = (valor: unknown): string | undefined => {
    const resultado = texto(valor)?.trim();
    return resultado ? resultado : undefined;
  };
  const columna = (nombre: string): unknown => {
    if (d[nombre] !== undefined) return d[nombre];
    const clave = Object.keys(d).find((key) => key.trim().toUpperCase() === nombre.toUpperCase());
    return clave ? d[clave] : undefined;
  };
  // La tabla real usa OK/ERROR/NO_APLICADO; se aceptan también los valores
  // históricos del esquema conceptual y los indicadores S/N de versiones
  // anteriores del portal.
  const normalizarEstado = (valor: unknown): string =>
    texto(valor)
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase() ?? "";
  const estadoFila = normalizarEstado(d.ESTADO_FILA ?? d.VALIDO ?? d.ESTADO);
  const valido = ["OK", "VALIDO", "S", "SI", "TRUE", "1"].includes(estadoFila);
  const precioActual = numero(d.PRECIO_ACTUAL);  
  const precioPropuesto = numero(d.PRECIO_SIMULADO);
  const factorPropuesto = numero(d.FACTOR_SOLICITADO);
  const porcentajeSolicitado = factorPropuesto != null ? (factorPropuesto - 1) * 100 : null;
  const precioRedondeado = numero(d.PRECIO_SIMULADO);
  const esMargen = proceso === "MARGEN_UTILIDAD_MASIVO";
  const causa = textoNoVacio(d.CAUSA) ?? textoNoVacio(d.MENSAJE_ERROR) ?? null;
  const causaNormalizada = causa?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() ?? "";
  const esHallazgoMargen = !valido && (
    causaNormalizada.includes("MARGEN")
    || causaNormalizada.includes("COSTO")
  );
  const factorAplicado = numero(d.FACTOR_APLICADO);
  const mensajeError = textoNoVacio(d.MENSAJE_ERROR);
  const validacionBase: ValidacionPrecio = {
    valido,
    precioActual,
    precioPropuesto,
    factorPropuesto,
    precioRedondeado,
    estadoRedondeo: esHallazgoMargen ? "ALERTA_MARGEN" : null,
    factorReduccion: null,
    multiplicador: null,
    bandaRedondeo: null,
    margenMinimo: null,
    costo: numero(d.COSTO),
    costoMinimo: numero(d.COSTO),
    precioMin: numero(d.COSTO),
    causa,
  };

  if (esMargen) {
    const porcentajeReduccionSolicitado = numero(d.PORCENTAJE_MARGEN);
    const factorReduccionSolicitado = porcentajeReduccionSolicitado != null && porcentajeReduccionSolicitado >= 0 && porcentajeReduccionSolicitado < 100
      ? porcentajeReduccionSolicitado / 100
      : null;
    return {
      fila: numero(d.FILA) ?? numero(d.ID_DETALLE) ?? 0,
      codigo: String(d.SKU ?? ""),
      descripcion: String(d.DESCRIPCION ?? ""),
      porcentajeReduccion: porcentajeReduccionSolicitado,
      factorReduccion: factorReduccionSolicitado,
      multiplicadorMargen: factorReduccionSolicitado == null ? null : 1 - factorReduccionSolicitado,
      factorAplicado,
      mensajeError,
      validacion: {
        ...validacionBase,
        costoMinimoBase: null,
        costoMinimo: numero(d.COSTO),
        margenPromedio: numero(d.PORCENTAJE_MARGEN),
        margenSobrePrecioRedondeado: null,
        margenMinimoBase: null,
        factorPropuesto: factorReduccionSolicitado,
        porcentajeReduccion: porcentajeReduccionSolicitado,
        factorReduccion: factorReduccionSolicitado,
        multiplicadorMargen: factorReduccionSolicitado == null ? null : 1 - factorReduccionSolicitado,
        codigoRechazo: null,
        causa,
      },
    };
  }

  const listaDetalle = proceso === "DESCUENTO_LISTA_PRECIO"
    ? textoNoVacio(columna("LISTA_PRECIO"))
    : textoPrimero(columna("LISTA_PRECIO"), columna("LISTA_CODIGO"), columna("LISTA"), listaSolicitud);

  return {
    fila: numero(d.FILA) ?? numero(d.ID_DETALLE) ?? 0,
    codigo: String(d.SKU ?? ""),
    descripcion: String(d.DESCRIPCION ?? ""),
    listaCodigo: listaDetalle ?? undefined,
    grupoArticulo: undefined,
    tipoVariacion: undefined,
    variacionPorcentaje: porcentajeSolicitado ?? undefined,
    valorPropuestoRaw: factorPropuesto != null ? factorPropuesto.toFixed(4) : undefined,
    lista: listaDetalle,
    precioCalculado: numero(d.PRECIO_SIMULADO) ?? 0,
    validacion: validacionBase,
    precioMin : numero(d.COSTO) ?? 0,
    factorPropuesto: factorPropuesto ?? 0,
    multiplicador: factorPropuesto,
    factorAplicado,
    mensajeError,
  };
}

export const requestsRepository = {
  list: listarSolicitudes,
  find: obtenerSolicitud,
  nextCode: siguienteCodigoSolicitud,
  create: agregarSolicitud,
  update: actualizarSolicitud,
  setDetailError: actualizarMensajeErrorDetalles,
  markDetailsApplied: actualizarFactorAplicadoDetalles,
};
