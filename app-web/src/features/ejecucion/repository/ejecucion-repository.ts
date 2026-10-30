import "server-only";

import type { EjecucionKey, EjecucionLog, EstadoEjecucion } from "@/shared/types/domain-types";
import type { Prisma } from "@/generated/sqlserver";
import { assertEscrituraPortalHabilitada, assertEscrituraSoftlandHabilitada } from "@/server/companies";
import { ahoraServidor, esquemaDe, getPool, plano, portalDb } from "@/server/db";

export type CrearEjecucionInput = {
  tipo: EjecucionKey;
  parametros: Record<string, unknown>;
  spNombre: string;
  observaciones?: string | null;
};

export type ActualizarEjecucionInput = {
  estado: EstadoEjecucion;
  totalArticulos?: number | null;
  exitosos?: number | null;
  fallidos?: number | null;
  observaciones?: string | null;
  codigoError?: string | null;
  mensajeError?: string | null;
};

function toEjecucionLog(row: Record<string, unknown>): EjecucionLog {
  return {
    id: String(row.ID_EJECUCION),
    tipo: row.TIPO_EJECUCION as EjecucionKey,
    compania: String(row.COMPANIA ?? ""),
    ejecutadoPor: String(row.EJECUTADO_POR_NOMBRE ?? ""),
    ejecutadoPorEmail: String(row.EJECUTADO_POR_EMAIL ?? ""),
    // ISO con la hora local del SQL Server marcada como UTC; la UI la formatea con fmtFechaBd.
    fechaInicio: (row.FECHA_INICIO as Date).toISOString(),
    fechaFin: row.FECHA_FIN ? (row.FECHA_FIN as Date).toISOString() : null,
    estado: row.ESTADO as EstadoEjecucion,
    totalArticulos: row.TOTAL_ARTICULOS == null ? 0 : Number(row.TOTAL_ARTICULOS),
    exitosos:       row.EXITOSOS == null ? 0 : Number(row.EXITOSOS),
    fallidos:       row.FALLIDOS == null ? 0 : Number(row.FALLIDOS),
    idProcesoSP: row.ID_PROCESO_SP == null ? null : String(row.ID_PROCESO_SP),
    observaciones: row.OBSERVACIONES == null ? null : String(row.OBSERVACIONES),
  };
}

const ESTADOS_FINALES: EstadoEjecucion[] = ["COMPLETADO", "COMPLETADO_CON_ERRORES", "ERROR"];

async function crear(compania: string, email: string, nombre: string, input: CrearEjecucionInput): Promise<EjecucionLog> {
  assertEscrituraPortalHabilitada();
  try {
    const row = await portalDb(compania).eJECUCION_LOG.create({
      data: {
        TIPO_EJECUCION: input.tipo,
        COMPANIA: compania,
        EJECUTADO_POR_EMAIL: email,
        EJECUTADO_POR_NOMBRE: nombre,
        PARAMETROS_JSON: JSON.stringify(input.parametros),
        SP_NOMBRE: input.spNombre,
        ESTADO: "EN_PROCESO",
        OBSERVACIONES: input.observaciones ?? null,
      },
    });
    return toEjecucionLog(plano(row));
  } catch (error) {
    // P2003: Foreign key constraint violated — la compañía no existe en tabla COMPANIA del Portal
    if ((error as { code?: string }).code === "P2003") {
      throw new Error(`La compañía '${compania}' no está registrada en el Portal. Contacte al administrador para agregarla a la tabla COMPANIA.`);
    }
    throw error;
  }
}

async function actualizar(compania: string, id: string, input: ActualizarEjecucionInput): Promise<EjecucionLog> {
  assertEscrituraPortalHabilitada();
  const db = portalDb(compania);
  const idEjecucion = BigInt(id);
  // FECHA_FIN solo se fija al llegar a un estado final (equivalente al GETDATE() del SQL anterior).
  const fechaFin = ESTADOS_FINALES.includes(input.estado) ? await ahoraServidor(db) : undefined;
  try {
    const row = await db.eJECUCION_LOG.update({
      where: { ID_EJECUCION: idEjecucion },
      data: {
        ESTADO: input.estado,
        ...(fechaFin ? { FECHA_FIN: fechaFin } : {}),
        TOTAL_ARTICULOS: input.totalArticulos ?? null,
        EXITOSOS: input.exitosos ?? null,
        FALLIDOS: input.fallidos ?? null,
        OBSERVACIONES: input.observaciones ?? null,
        CODIGO_ERROR: input.codigoError ?? null,
        MENSAJE_ERROR: input.mensajeError ?? null,
      },
    });
    return toEjecucionLog(plano(row));
  } catch (error) {
    // P2025: registro no encontrado
    if ((error as { code?: string }).code === "P2025") throw new Error("No existe la ejecución solicitada.");
    throw error;
  }
}

export type EjecucionSpPreciosInput = {
  nivelPrecio: string;
  moneda: string | null;
  fechaInicio: string;         // YYYY-MM-DD
  fechaFin: string;            // YYYY-MM-DD
  nivelPrecioBase: string;
  monedaBase: string | null;
  factorMultiplicador: number;
  version: number;
  // El usuario solicitante se toma de la identidad en el servidor
  usuarioSolicitante?: string;
  validarPrecioBajoCosto: boolean;
  exigirFactorConfigurado: boolean;
  /** Puede ser NULL en BD — VARCHAR(MAX), lista de articulos como string */
  excepcionesArticulos: string | null;
};

export type EjecucionSpPreciosResult = {
  filasAfectadas: number;
  observaciones: string;
};

/**
 * Ejecuta SP_GESTION_LISTAS_PRECIOS_FULL contra la BD de Softland.
 * Retorna filas afectadas y un resumen para persistir en el log.
 * Lanza excepción si la ejecución está bloqueada o si el SP falla.
 */
async function ejecutarSpPrecios(compania: string, input: EjecucionSpPreciosInput): Promise<EjecucionSpPreciosResult> {
  assertEscrituraSoftlandHabilitada();
  const pool = await getPool(compania);
  const mssql = await import("mssql");
  const sp = `${esquemaDe(compania)}.[SP_GESTION_LISTAS_PRECIOS_FULL]`;

  const req = pool.request()
    .input("p_nivel_precio",               mssql.VarChar(50),    input.nivelPrecio)
    .input("p_moneda",                     mssql.VarChar(1),     input.moneda ?? null)
    .input("p_fecha_inicio",               mssql.Date,           new Date(input.fechaInicio))
    .input("p_fecha_fin",                  mssql.Date,           new Date(input.fechaFin))
    .input("p_nivel_precio_base",          mssql.VarChar(50),    input.nivelPrecioBase)
    .input("p_moneda_base",                mssql.VarChar(1),     input.monedaBase ?? null)
    .input("p_factor_multiplicador",       mssql.Decimal(28, 8), input.factorMultiplicador)
    .input("p_version",                    mssql.Int,            input.version);

  const result = await req.execute(sp);
  const filasAfectadas = result.rowsAffected.reduce((sum, n) => sum + n, 0);
  const observaciones = `SP ejecutado correctamente. Filas afectadas: ${filasAfectadas}.`;
  return { filasAfectadas, observaciones };
}

async function listar(compania: string, tipo: EjecucionKey): Promise<EjecucionLog[]> {
  const rows = await portalDb(compania).eJECUCION_LOG.findMany({
    where: { COMPANIA: compania, TIPO_EJECUCION: tipo },
    orderBy: { FECHA_INICIO: "desc" },
    take: 50,
  });
  return rows.map((row) => toEjecucionLog(plano(row)));
}

// ── Tipos para la vista de auditoría ─────────────────────────────────────────

export type EjecucionAuditParams = {
  compania: string;
  offset?: number;
  limit?: number;
  tipo?: string;
  estado?: string;
  search?: string;
};

export type EjecucionAuditResult = {
  ejecuciones: EjecucionLog[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
};

/**
 * Listado paginado de EJECUCION_LOG para el módulo de Auditoría.
 * A diferencia de `listar`, no filtra por tipo obligatorio y soporta
 * paginación offset/limit con filtros opcionales de tipo, estado y búsqueda.
 */
async function listarAudit(params: EjecucionAuditParams): Promise<EjecucionAuditResult> {
  const { compania, offset = 0, limit = 50, tipo, estado, search } = params;

  const where: Prisma.EJECUCION_LOGWhereInput = {
    COMPANIA: compania,
    ...(tipo ? { TIPO_EJECUCION: tipo } : {}),
    ...(estado ? { ESTADO: estado } : {}),
    ...(search
      ? { OR: [{ EJECUTADO_POR_EMAIL: { contains: search } }, { EJECUTADO_POR_NOMBRE: { contains: search } }, { ID_PROCESO_SP: { contains: search } }] }
      : {}),
  };
  const db = portalDb(compania);
  const [total, rows] = await Promise.all([
    db.eJECUCION_LOG.count({ where }),
    db.eJECUCION_LOG.findMany({ where, orderBy: { FECHA_INICIO: "desc" }, skip: offset, take: limit }),
  ]);
  const ejecuciones = rows.map((row) => toEjecucionLog(plano(row)));
  const nextOff = offset + ejecuciones.length;

  return {
    ejecuciones,
    total,
    hasMore: nextOff < total,
    nextOffset: nextOff < total ? nextOff : null,
  };
}

export const ejecucionRepository = { crear, actualizar, listar, listarAudit, ejecutarSpPrecios };
