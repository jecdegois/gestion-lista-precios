import "server-only";
import type { EventoAuditoria, EventoTipo, Rol } from "@/lib/domain-types";
import { assertEscrituraPortalHabilitada, esModoDemo, objetoPortal } from "@/server/companies";
import { getPortalPool } from "@/server/db";
import {
  listarEventos as demoListarEventos,
  registrarEvento as demoRegistrarEvento,
} from "@/features/solicitudes/repository/demo-store";
import { AUDIT_PAGE_SIZE } from "../audit-constants";

export { AUDIT_PAGE_SIZE };

export type AuditEventInput = {
  event: EventoTipo;
  user: string;
  role: Rol;
  company: string;
  requestId: string | null;
  processId?: string | null;
  userEmail?: string;
};

export type AuditListParams = {
  compania: string;
  offset?: number;
  limit?: number;
  rol?: string;
  evento?: string;
  search?: string;
};

export type AuditListResult = {
  eventos: EventoAuditoria[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
};

/**
 * Bitácora del flujo maker-checker en PORTAL_PRECIOS.<esquema de la empresa>.AUDITORIA_PRECIOS.
 * En DEMO_MODE usa el store en memoria compartido con las solicitudes.
 */
async function record(input: AuditEventInput): Promise<void> {
  const { event, user, role, company, requestId, processId = null, userEmail = "" } = input;
  assertEscrituraPortalHabilitada();
  if (esModoDemo()) {
    demoRegistrarEvento(event, user, role, company, requestId, processId);
    return;
  }
  const pool = await getPortalPool();
  const ae = objetoPortal(company, "AUDITORIA_PRECIOS");
  const mssql = await import("mssql");
  const payload = JSON.stringify({ usuario: user, compania: company, solicitudId: requestId });
  await pool
    .request()
    .input("proceso", mssql.VarChar(30), processId ?? requestId ?? event)
    .input("subject", mssql.VarChar(120), userEmail || user)
    .input("rol", mssql.VarChar(15), role)
    .input("evento", mssql.VarChar(50), event)
    .input("payload", mssql.NVarChar(mssql.MAX), payload)
    .query(
      `INSERT INTO ${ae} (ID_PROCESO, IDP_SUBJECT, ROL, EVENTO, PAYLOAD_JSON, FECHA_EVENTO)
       VALUES (@proceso,@subject,@rol,@evento,@payload,GETDATE());`,
    );
}

function mapRow(r: Record<string, unknown>, fallbackCompania: string): EventoAuditoria {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(r.PAYLOAD_JSON ?? "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
  } catch {
    // Un registro histórico con JSON inválido aún debe poder visualizarse.
  }
  const rol = r.ROL === "APROBADOR" || r.ROL === "OPERADOR" || r.ROL === "AUDITOR" ? r.ROL : "OPERADOR";
  return {
    id: String(r.ID_AUDITORIA),
    fecha: new Date(r.FECHA_EVENTO as string).toLocaleString("es-CR", { hour12: false }),
    usuario: typeof payload.usuario === "string" ? payload.usuario : String(r.IDP_SUBJECT ?? ""),
    rol: rol as Rol,
    evento: r.EVENTO as EventoTipo,
    solicitudId: typeof payload.solicitudId === "string" ? payload.solicitudId : null,
    idProcesoSP: (r.ID_PROCESO as string) ?? null,
    compania: typeof payload.compania === "string" ? payload.compania : fallbackCompania,
  };
}

async function list(params: AuditListParams): Promise<AuditListResult> {
  const { compania, offset = 0, limit = AUDIT_PAGE_SIZE, rol, evento, search } = params;

  if (esModoDemo()) {
    // Demo: filtrado y paginación en memoria
    let todos = demoListarEventos(compania);
    if (rol) todos = todos.filter((e) => e.rol === rol);
    if (evento) todos = todos.filter((e) => e.evento === evento);
    if (search) {
      const q = search.toLowerCase();
      todos = todos.filter(
        (e) =>
          e.usuario.toLowerCase().includes(q) ||
          (e.solicitudId ?? "").toLowerCase().includes(q) ||
          (e.idProcesoSP ?? "").toLowerCase().includes(q),
      );
    }
    const total = todos.length;
    const slice = todos.slice(offset, offset + limit);
    const nextOff = offset + slice.length;
    return {
      eventos: slice,
      total,
      hasMore: nextOff < total,
      nextOffset: nextOff < total ? nextOff : null,
    };
  }

  const pool = await getPortalPool();
  const ae = objetoPortal(compania, "AUDITORIA_PRECIOS");
  const mssql = await import("mssql");

  const columnas = "ID_AUDITORIA, ID_PROCESO, IDP_SUBJECT, ROL, EVENTO, PAYLOAD_JSON, FECHA_EVENTO";

  // ── Condiciones WHERE dinámicas ────────────────────────────────────────────
  const conditions: string[] = [
    "ISJSON(PAYLOAD_JSON) = 1",
    "JSON_VALUE(PAYLOAD_JSON, '$.compania') = @comp",
  ];
  if (rol) conditions.push("ROL = @rol");
  if (evento) conditions.push("EVENTO = @evento");
  if (search) conditions.push(
    "(IDP_SUBJECT LIKE @search OR JSON_VALUE(PAYLOAD_JSON, '$.usuario') LIKE @search OR JSON_VALUE(PAYLOAD_JSON, '$.solicitudId') LIKE @search OR ID_PROCESO LIKE @search)",
  );

  const where = conditions.join(" AND ");

  // ── COUNT para saber el total ──────────────────────────────────────────────
  const countReq = pool
    .request()
    .input("comp", mssql.VarChar(20), compania);
  if (rol) countReq.input("rol", mssql.VarChar(15), rol);
  if (evento) countReq.input("evento", mssql.VarChar(50), evento);
  if (search) countReq.input("search", mssql.VarChar(120), `%${search}%`);

  const countRes = await countReq.query(`SELECT COUNT(1) AS total FROM ${ae} WITH(NOLOCK) WHERE ${where}`);
  const total: number = (countRes.recordset[0] as { total: number }).total;

  // ── Página de datos ────────────────────────────────────────────────────────
  const dataReq = pool
    .request()
    .input("comp", mssql.VarChar(20), compania)
    .input("offset", mssql.Int, offset)
    .input("limit", mssql.Int, limit);
  if (rol) dataReq.input("rol", mssql.VarChar(15), rol);
  if (evento) dataReq.input("evento", mssql.VarChar(50), evento);
  if (search) dataReq.input("search", mssql.VarChar(120), `%${search}%`);

  const dataRes = await dataReq.query(
    `SELECT ${columnas}
       FROM ${ae} WITH(NOLOCK)
      WHERE ${where}
      ORDER BY FECHA_EVENTO DESC
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
  );

  const eventos = dataRes.recordset.map((r: Record<string, unknown>) => mapRow(r, compania));
  const nextOff = offset + eventos.length;

  return {
    eventos,
    total,
    hasMore: nextOff < total,
    nextOffset: nextOff < total ? nextOff : null,
  };
}

export const auditRepository = { record, list };
