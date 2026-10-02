import "server-only";
import type { EventoAuditoria, EventoTipo, Rol } from "@/shared/types/domain-types";
import { assertEscrituraPortalHabilitada, esModoDemo, objetoPortal } from "@/server/companies";
import { portalDb } from "@/server/db";
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
  await portalDb(company).aUDITORIA_PRECIOS.create({
    data: {
      ID_PROCESO: processId ?? requestId ?? event,
      IDP_SUBJECT: userEmail || user,
      ROL: role,
      EVENTO: event,
      PAYLOAD_JSON: JSON.stringify({ usuario: user, compania: company, solicitudId: requestId }),
    },
  });
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

  // Filtros sobre el JSON: Prisma no los soporta en SQL Server, queda en SQL (calificado por esquema).
  // $queryRawUnsafe con parámetros @Pn: ver objetoPortal (Prisma.raw no sirve en el bundle de Next).
  const ae = objetoPortal(compania, "AUDITORIA_PRECIOS");
  const valores: unknown[] = [compania];
  const where = ["ISJSON(PAYLOAD_JSON) = 1", "JSON_VALUE(PAYLOAD_JSON, '$.compania') = @P1"];
  if (rol) where.push(`ROL = @P${valores.push(rol)}`);
  if (evento) where.push(`EVENTO = @P${valores.push(evento)}`);
  if (search) {
    const p = `@P${valores.push(`%${search}%`)}`;
    where.push(`(IDP_SUBJECT LIKE ${p} OR JSON_VALUE(PAYLOAD_JSON, '$.usuario') LIKE ${p} OR JSON_VALUE(PAYLOAD_JSON, '$.solicitudId') LIKE ${p} OR ID_PROCESO LIKE ${p})`);
  }
  const condicion = where.join(" AND ");

  const db = portalDb(compania);
  const [[{ total }], rows] = await Promise.all([
    db.$queryRawUnsafe<{ total: number }[]>(`SELECT COUNT(1) AS total FROM ${ae} WITH(NOLOCK) WHERE ${condicion}`, ...valores),
    db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT ID_AUDITORIA, ID_PROCESO, IDP_SUBJECT, ROL, EVENTO, PAYLOAD_JSON, FECHA_EVENTO
         FROM ${ae} WITH(NOLOCK)
        WHERE ${condicion}
        ORDER BY FECHA_EVENTO DESC
       OFFSET @P${valores.length + 1} ROWS FETCH NEXT @P${valores.length + 2} ROWS ONLY`,
      ...valores, offset, limit,
    ),
  ]);

  const eventos = rows.map((r) => mapRow(r, compania));
  const nextOff = offset + eventos.length;

  return {
    eventos,
    total,
    hasMore: nextOff < total,
    nextOffset: nextOff < total ? nextOff : null,
  };
}

export const auditRepository = { record, list };
