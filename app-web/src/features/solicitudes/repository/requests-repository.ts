import "server-only";
import { Prisma } from "@/generated/sqlserver";
import type { FilaMargen, FilaPrecio, FilaResultado, Solicitud, ValidacionPrecio } from "@/lib/domain-types";
import { assertEscrituraPortalHabilitada, esModoDemo, objetoPortal } from "@/server/companies";
import { ahoraServidor, plano, portalDb } from "@/server/db";
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
 * con Prisma en las tablas del esquema de la empresa (ver portalDb). Toda la
 * API es async para servir a ambos modos de forma uniforme.
 */

const conDetalle = { SOLICITUD_DETALLE: { orderBy: { ID_DETALLE: "asc" } } } satisfies Prisma.SOLICITUDInclude;

function mapConDetalle(r: Prisma.SOLICITUDGetPayload<{ include: typeof conDetalle }>): Solicitud {
  const { SOLICITUD_DETALLE, ...cabecera } = r;
  return mapSolicitud(plano(cabecera), SOLICITUD_DETALLE.map(plano));
}

async function listarSolicitudes(compania: string): Promise<Solicitud[]> {
  const companiaNormalizada = compania.trim().toUpperCase();
  if (esModoDemo()) {
    return demoListarSolicitudes().filter((solicitud) => !companiaNormalizada || solicitud.compania === companiaNormalizada);
  }

  const rows = await portalDb(companiaNormalizada).sOLICITUD.findMany({
    where: { COMPANIA: companiaNormalizada },
    include: conDetalle,
    orderBy: { FECHA_CREACION: "desc" },
  });
  return rows.map(mapConDetalle);
}

export interface PaginaSolicitudes {
  solicitudes: Solicitud[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
}

/**
 * Cabeceras de solicitudes paginadas, SIN detalle de filas.
 * Las filas de detalle se obtienen con `obtenerSolicitud` al abrir el modal.
 * @param email  Si se indica, filtra por SOLICITANTE_EMAIL (mis solicitudes).
 *               Si es null/undefined, trae todas las de la compañía (bandeja).
 */
async function listarSolicitudesPaginado(
  compania: string,
  offset: number,
  limit: number,
  email?: string | null,
  proceso?: string | null,
): Promise<PaginaSolicitudes> {
  const companiaNormalizada = compania.trim().toUpperCase();
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  if (esModoDemo()) {
    const todas = demoListarSolicitudes().filter(
      (s) =>
        (!companiaNormalizada || s.compania === companiaNormalizada) &&
        (!email || s.solicitanteEmail === email) &&
        (!proceso || s.proceso === proceso),
    );
    const pagina = todas.slice(safeOffset, safeOffset + safeLimit);
    const hasMore = safeOffset + pagina.length < todas.length;
    return {
      solicitudes: pagina,
      total: todas.length,
      hasMore,
      nextOffset: hasMore ? safeOffset + pagina.length : null,
    };
  }

  const db = portalDb(companiaNormalizada);
  // La collation del portal es case-insensitive: igualdad simple equivale al LOWER() anterior.
  const where: Prisma.SOLICITUDWhereInput = {
    COMPANIA: companiaNormalizada,
    ...(email?.trim() ? { SOLICITANTE_EMAIL: email.trim() } : {}),
    ...(proceso?.trim() ? { PROCESO: proceso.trim() } : {}),
  };
  const [rows, total] = await Promise.all([
    db.sOLICITUD.findMany({ where, orderBy: { FECHA_CREACION: "desc" }, skip: safeOffset, take: safeLimit }),
    db.sOLICITUD.count({ where }),
  ]);

  const solicitudes = rows.map((r) => mapSolicitudCabecera(plano(r)));
  const hasMore = safeOffset + solicitudes.length < total;
  return {
    solicitudes,
    total,
    hasMore,
    nextOffset: hasMore ? safeOffset + solicitudes.length : null,
  };
}

async function obtenerSolicitud(compania: string, codigo: string): Promise<Solicitud | undefined> {
  if (esModoDemo()) return demoObtener(codigo);
  const r = await portalDb(compania).sOLICITUD.findFirst({ where: { CODIGO_SOLICITUD: codigo }, include: conDetalle });
  return r ? mapConDetalle(r) : undefined;
}

async function siguienteCodigoSolicitud(compania: string): Promise<string> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) return "SOL-" + (10450 + demoSeq());
  // Prisma no modela secuencias; el SQL crudo no toma el schema de la URL, por eso se califica.
  const [q] = await portalDb(compania).$queryRaw<{ n: number }[]>`SELECT NEXT VALUE FOR ${Prisma.raw(objetoPortal(compania, "SEQ_SOLICITUD"))} AS n`;
  return "SOL-" + q.n;
}

async function agregarSolicitud(s: Solicitud): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) {
    demoAgregar(s);
    return;
  }
  const lista = String(s.parametros.nivelPrecio ?? s.parametros.listaBase ?? s.parametros.nivel ?? "").trim();
  // Cabecera + detalle en una sola transacción. La FK nullable a USUARIO (tabla
  // heredada) queda en NULL: los usuarios viven en Postgres.
  await portalDb(s.compania).sOLICITUD.create({
    data: {
      CODIGO_SOLICITUD: s.id,
      COMPANIA: s.compania,
      PROCESO: s.proceso,
      TIPO_PROCESO: s.proceso,
      MODALIDAD: s.modalidad,
      LISTA_PRECIO: lista || null,
      SOLICITANTE_EMAIL: s.solicitanteEmail,
      SOLICITANTE_NOMBRE: s.solicitanteNombre,
      ESTADO: s.estado ?? "PENDIENTE",
      PARAMETROS_JSON: JSON.stringify({ ...s.parametros, filas: s.filas }),
      ARCHIVO_NOMBRE: s.archivoNombre,
      ARCHIVO_S3_KEY: s.archivoS3Key,
      SOLICITUD_DETALLE: { createMany: { data: s.filas.map((f) => detalleData(f, s.proceso)) } },
    },
  });
}

async function actualizarSolicitud(compania: string, codigo: string, patch: Partial<Solicitud>): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) {
    demoActualizar(codigo, patch);
    return;
  }
  const db = portalDb(compania);
  const data: Prisma.SOLICITUDUpdateManyMutationInput = { FECHA_ULT_ESTADO: await ahoraServidor(db) };
  if (patch.estado !== undefined) data.ESTADO = patch.estado;
  if (patch.motivoRechazo !== undefined) data.MOTIVO_RECHAZO = patch.motivoRechazo;
  if (patch.idProcesoSP !== undefined) data.ID_PROCESO_SP = patch.idProcesoSP;
  if (patch.autorizadoPor !== undefined) data.APROBADOR_NOMBRE = patch.autorizadoPor;
  if (patch.autorizadoPorEmail !== undefined) data.APROBADOR_EMAIL = patch.autorizadoPorEmail;
  if (patch.resultado) {
    data.TOTAL_REGISTROS = patch.resultado.totalLote;
    data.EXITOSOS = patch.resultado.exitosos;
    data.FALLIDOS = patch.resultado.fallidos;
    data.LOG_S3_KEY = patch.resultado.logS3Key;
  }
  await db.sOLICITUD.updateMany({ where: { CODIGO_SOLICITUD: codigo }, data });
}

/** Guarda el error del procesamiento en las líneas de la solicitud. */
async function actualizarMensajeErrorDetalles(compania: string, codigo: string, mensaje: string): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) return;
  await portalDb(compania).sOLICITUD_DETALLE.updateMany({
    where: { SOLICITUD: { CODIGO_SOLICITUD: codigo } },
    data: { MENSAJE_ERROR: mensaje.slice(0, 400) },
  });
}

/** Marca como aplicado el factor solicitado únicamente en filas exitosas. */
async function actualizarFactorAplicadoDetalles(compania: string, codigo: string): Promise<void> {
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) return;
  // Asignación columna-a-columna: Prisma no la soporta, queda en SQL (calificado por esquema).
  const spd = Prisma.raw(objetoPortal(compania, "SOLICITUD_DETALLE"));
  const sp = Prisma.raw(objetoPortal(compania, "SOLICITUD"));
  await portalDb(compania).$executeRaw`
    UPDATE D
       SET D.FACTOR_APLICADO = D.FACTOR_SOLICITADO
      FROM ${spd} D
      INNER JOIN ${sp} S ON S.ID_SOLICITUD = D.ID_SOLICITUD
     WHERE S.CODIGO_SOLICITUD = ${codigo}
       AND UPPER(LTRIM(RTRIM(COALESCE(D.ESTADO_FILA, '')))) IN ('VALIDO','OK','S','SI','1')
       AND NULLIF(LTRIM(RTRIM(COALESCE(D.MENSAJE_ERROR, ''))), '') IS NULL;`;
}
// ---------------------------------------------------------------------------
// Helpers de mapeo
// ---------------------------------------------------------------------------

function detalleData(f: FilaResultado, proceso: Solicitud["proceso"]): Prisma.SOLICITUD_DETALLECreateManySOLICITUDInput {
  const v = f.validacion;
  const numero = (valor: unknown): number | null =>
    typeof valor === "number" && Number.isFinite(valor) ? valor : null;
  const esMargen = Object.prototype.hasOwnProperty.call(v, "factorReduccion");
  const filaMargen = esMargen ? f as FilaMargen : null;

  return {
    SKU: f.codigo || "SIN_CODIGO",
    DESCRIPCION: f.descripcion || "",
    PRECIO_ACTUAL: numero(v.precioActual) ?? 0,
    COSTO: numero(v.costo) ?? 0,
    // El procesador externo todavía no aplica el precio por fila en este
    // flujo. El esquema real de SOLICITUD_DETALLE exige FACTOR_APLICADO. Para
    // Precio Base no aplica un factor, por lo que 1.000000 representa el
    // multiplicador neutro; el precio absoluto viaja en PRECIO_SIMULADO.
    FACTOR_APLICADO: numero((f as FilaPrecio | FilaMargen).factorAplicado) ?? 1,
    PRECIO_SIMULADO: numero(proceso === "MAYOREOD_MASIVO" ? v.precioPropuesto : v.precioRedondeado ?? v.precioPropuesto) ?? 0,
    PORCENTAJE_MARGEN: esMargen ? filaMargen?.porcentajeReduccion ?? 0 : v.margenMinimo ?? 0,
    // CK_PP_SOLDET_ESTADO admite OK | ERROR | BAJO_COSTO | MARGEN_NEGATIVO; el motivo va en CAUSA.
    ESTADO_FILA: v.valido ? "OK" : "ERROR",
    MENSAJE_ERROR: (f as FilaPrecio | FilaMargen).mensajeError ?? (!v.valido ? v.causa ?? "Error no identificado" : null),
    // FACTOR_SOLICITADO representa el multiplicador persistido, no el
    // porcentaje capturado. El porcentaje queda en PARAMETROS_JSON.
    FACTOR_SOLICITADO: numero("multiplicador" in f ? f.multiplicador : null) ?? numero(v.factorPropuesto) ?? 1,
    // LISTA_PRECIO es el origen del valor que se muestra en el detalle. Para
    // descuento por artículo se guarda el código de lista de la fila.
    LISTA_PRECIO: ("listaCodigo" in f ? f.listaCodigo : null) ?? f.lista ?? "",
    CAUSA: v.causa ?? "",
  };
}

function textoPrimero(...valores: unknown[]): string | undefined {
  return valores
    .map((valor) => valor == null ? undefined : String(valor))
    .find((valor) => Boolean(valor?.trim()));
}

/**
 * Mapea una fila de SOLICITUD a un objeto Solicitud SIN filas de detalle.
 * Elimina además `filas` del PARAMETROS_JSON para que la respuesta de la
 * bandeja no cargue datos que no se necesitan hasta abrir el modal.
 */
function mapSolicitudCabecera(r: Record<string, unknown>): Solicitud {
  let parametrosRaw: Record<string, unknown> = {};
  try {
    parametrosRaw = r.PARAMETROS_JSON ? (JSON.parse(String(r.PARAMETROS_JSON)) as Record<string, unknown>) : {};
  } catch {
    parametrosRaw = {};
  }
  // Eliminar las filas embedidas — solo se cargan al abrir el modal
  const { filas: _filas, articulos: _articulos, ...parametros } = parametrosRaw;
  void _filas;
  void _articulos;

  const lista =
    textoPrimero(r.LISTA_PRECIO, r.LISTA, r.NIVEL_PRECIO, parametros.nivelPrecio, parametros.listaBase) ?? "";
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
    filas: [],
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
  listPaged: (compania: string, offset: number, limit: number, email?: string | null, proceso?: string | null) =>
    listarSolicitudesPaginado(compania, offset, limit, email, proceso),
  find: obtenerSolicitud,
  nextCode: siguienteCodigoSolicitud,
  create: agregarSolicitud,
  update: actualizarSolicitud,
  setDetailError: actualizarMensajeErrorDetalles,
  markDetailsApplied: actualizarFactorAplicadoDetalles,
};
