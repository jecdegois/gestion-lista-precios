import "server-only";

import type { EjecucionKey, EjecucionLog, EstadoEjecucion } from "@/lib/domain-types";
import { assertEscrituraPortalHabilitada } from "@/server/companies";
import { Prisma } from "@/generated/sqlserver";
import { ahoraServidor, plano, portalDb } from "@/server/db";

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
};

function toEjecucionLog(row: Record<string, unknown>): EjecucionLog {
  return {
    id: String(row.ID_EJECUCION),
    tipo: row.TIPO_EJECUCION as EjecucionKey,
    compania: String(row.COMPANIA ?? ""),
    ejecutadoPor: String(row.EJECUTADO_POR_NOMBRE ?? ""),
    ejecutadoPorEmail: String(row.EJECUTADO_POR_EMAIL ?? ""),
    fechaInicio: new Date(row.FECHA_INICIO as string).toLocaleString("es-VE"),
    fechaFin: row.FECHA_FIN ? new Date(row.FECHA_FIN as string).toLocaleString("es-VE") : null,
    estado: row.ESTADO as EstadoEjecucion,
    totalArticulos: Number(row.TOTAL_ARTICULOS ?? 0),
    exitosos: Number(row.EXITOSOS ?? 0),
    fallidos: Number(row.FALLIDOS ?? 0),
    idProcesoSP: row.ID_PROCESO_SP == null ? null : String(row.ID_PROCESO_SP),
    observaciones: row.OBSERVACIONES == null ? null : String(row.OBSERVACIONES),
  };
}

const ESTADOS_FINALES: EstadoEjecucion[] = ["COMPLETADO", "COMPLETADO_CON_ERRORES", "ERROR"];

async function crear(compania: string, email: string, nombre: string, input: CrearEjecucionInput): Promise<EjecucionLog> {
  assertEscrituraPortalHabilitada();
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
}

async function actualizar(compania: string, id: string, input: ActualizarEjecucionInput): Promise<EjecucionLog> {
  assertEscrituraPortalHabilitada();
  const db = portalDb(compania);
  try {
    const row = await db.eJECUCION_LOG.update({
      where: { ID_EJECUCION: BigInt(id) },
      data: {
        ESTADO: input.estado,
        ...(ESTADOS_FINALES.includes(input.estado) ? { FECHA_FIN: await ahoraServidor(db) } : {}),
        TOTAL_ARTICULOS: input.totalArticulos ?? null,
        EXITOSOS: input.exitosos ?? null,
        FALLIDOS: input.fallidos ?? null,
        OBSERVACIONES: input.observaciones ?? null,
      },
    });
    return toEjecucionLog(plano(row));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") throw new Error("No existe la ejecución solicitada.");
    throw err;
  }
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

export const ejecucionRepository = { crear, actualizar, listar, listarAudit };
