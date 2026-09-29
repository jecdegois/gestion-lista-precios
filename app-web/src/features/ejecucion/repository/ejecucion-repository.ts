import "server-only";

import type { EjecucionKey, EjecucionLog, EstadoEjecucion } from "@/lib/domain-types";
import { assertEscrituraPortalHabilitada, objetoPortal } from "@/server/companies";
import { getPortalPool } from "@/server/db";

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

async function crear(compania: string, email: string, nombre: string, input: CrearEjecucionInput): Promise<EjecucionLog> {
  assertEscrituraPortalHabilitada();
  const pool = await getPortalPool();
  const tabla = objetoPortal(compania, "EJECUCION_LOG");
  const mssql = await import("mssql");
  const q = await pool.request()
    .input("tipo", mssql.VarChar(25), input.tipo)
    .input("compania", mssql.VarChar(20), compania)
    .input("email", mssql.VarChar(120), email)
    .input("nombre", mssql.VarChar(120), nombre)
    .input("parametros", mssql.NVarChar(mssql.MAX), JSON.stringify(input.parametros))
    .input("spNombre", mssql.VarChar(100), input.spNombre)
    .input("estado", mssql.VarChar(25), "EN_PROCESO")
    .input("observaciones", mssql.VarChar(500), input.observaciones ?? null)
    .query(
      `INSERT INTO ${tabla}
        (TIPO_EJECUCION, COMPANIA, EJECUTADO_POR_EMAIL, EJECUTADO_POR_NOMBRE,
         PARAMETROS_JSON, SP_NOMBRE, ESTADO, OBSERVACIONES)
       OUTPUT INSERTED.*
       VALUES (@tipo, @compania, @email, @nombre, @parametros, @spNombre, @estado, @observaciones);`,
    );
  return toEjecucionLog(q.recordset[0] as Record<string, unknown>);
}

async function actualizar(compania: string, id: string, input: ActualizarEjecucionInput): Promise<EjecucionLog> {
  assertEscrituraPortalHabilitada();
  const pool = await getPortalPool();
  const tabla = objetoPortal(compania, "EJECUCION_LOG");
  const mssql = await import("mssql");
  const q = await pool.request()
    .input("id", mssql.BigInt, id)
    .input("estado", mssql.VarChar(25), input.estado)
    .input("total", mssql.Int, input.totalArticulos ?? null)
    .input("exitosos", mssql.Int, input.exitosos ?? null)
    .input("fallidos", mssql.Int, input.fallidos ?? null)
    .input("observaciones", mssql.VarChar(500), input.observaciones ?? null)
    .query(
      `UPDATE ${tabla}
          SET ESTADO = @estado,
              FECHA_FIN = CASE WHEN @estado IN ('COMPLETADO', 'COMPLETADO_CON_ERRORES', 'ERROR') THEN GETDATE() ELSE FECHA_FIN END,
              TOTAL_ARTICULOS = @total,
              EXITOSOS = @exitosos,
              FALLIDOS = @fallidos,
              OBSERVACIONES = @observaciones
        OUTPUT INSERTED.*
        WHERE ID_EJECUCION = @id;`,
    );
  if (!q.recordset[0]) throw new Error("No existe la ejecución solicitada.");
  return toEjecucionLog(q.recordset[0] as Record<string, unknown>);
}

async function listar(compania: string, tipo: EjecucionKey): Promise<EjecucionLog[]> {
  const pool = await getPortalPool();
  const tabla = objetoPortal(compania, "EJECUCION_LOG");
  const mssql = await import("mssql");
  const q = await pool.request()
    .input("compania", mssql.VarChar(20), compania)
    .input("tipo", mssql.VarChar(25), tipo)
    .query(`SELECT TOP (50) * FROM ${tabla} WITH(NOLOCK) WHERE COMPANIA = @compania AND TIPO_EJECUCION = @tipo ORDER BY FECHA_INICIO DESC;`);
  return q.recordset.map((row) => toEjecucionLog(row as Record<string, unknown>));
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

  const pool = await getPortalPool();
  const tabla = objetoPortal(compania, "EJECUCION_LOG");
  const mssql = await import("mssql");

  // ── WHERE dinámico ────────────────────────────────────────────────────────
  const conditions: string[] = ["COMPANIA = @compania"];
  if (tipo)   conditions.push("TIPO_EJECUCION = @tipo");
  if (estado) conditions.push("ESTADO = @estado");
  if (search) conditions.push(
    "(EJECUTADO_POR_EMAIL LIKE @search OR EJECUTADO_POR_NOMBRE LIKE @search OR ID_PROCESO_SP LIKE @search)",
  );
  const where = conditions.join(" AND ");

  function bindFilters(req: ReturnType<typeof pool.request>) {
    req.input("compania", mssql.VarChar(20), compania);
    if (tipo)   req.input("tipo",   mssql.VarChar(25),  tipo);
    if (estado) req.input("estado", mssql.VarChar(25),  estado);
    if (search) req.input("search", mssql.VarChar(120), `%${search}%`);
    return req;
  }

  // ── COUNT ─────────────────────────────────────────────────────────────────
  const countRes = await bindFilters(pool.request())
    .query(`SELECT COUNT(1) AS total FROM ${tabla} WITH(NOLOCK) WHERE ${where}`);
  const total: number = (countRes.recordset[0] as { total: number }).total;

  // ── Datos paginados ───────────────────────────────────────────────────────
  const dataRes = await bindFilters(pool.request())
    .input("offset", mssql.Int, offset)
    .input("limit",  mssql.Int, limit)
    .query(
      `SELECT * FROM ${tabla} WITH(NOLOCK)
        WHERE ${where}
        ORDER BY FECHA_INICIO DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );

  const ejecuciones = dataRes.recordset.map((row) => toEjecucionLog(row as Record<string, unknown>));
  const nextOff = offset + ejecuciones.length;

  return {
    ejecuciones,
    total,
    hasMore: nextOff < total,
    nextOffset: nextOff < total ? nextOff : null,
  };
}

export const ejecucionRepository = { crear, actualizar, listar, listarAudit };
