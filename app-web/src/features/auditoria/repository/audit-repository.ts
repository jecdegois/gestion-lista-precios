import "server-only";
import { Prisma } from "@/generated/sqlserver";
import type { EventoAuditoria, EventoTipo, Rol } from "@/lib/domain-types";
import { assertEscrituraPortalHabilitada, esModoDemo, objetoPortal } from "@/server/companies";
import { portalDb } from "@/server/db";
import {
  listarEventos as demoListarEventos,
  registrarEvento as demoRegistrarEvento,
} from "@/features/solicitudes/repository/demo-store";

export type AuditEventInput = {
  event: EventoTipo;
  user: string;
  role: Rol;
  company: string;
  requestId: string | null;
  processId?: string | null;
  userEmail?: string;
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

async function list(compania: string): Promise<EventoAuditoria[]> {
  if (esModoDemo()) return demoListarEventos(compania);
  // Filtro sobre el JSON: Prisma no lo soporta en SQL Server, queda en SQL (calificado por esquema).
  const ae = Prisma.raw(objetoPortal(compania, "AUDITORIA_PRECIOS"));
  const rows = await portalDb(compania).$queryRaw<Record<string, unknown>[]>`
    SELECT TOP (200) ID_AUDITORIA, ID_PROCESO, IDP_SUBJECT, ROL, EVENTO, PAYLOAD_JSON, FECHA_EVENTO
      FROM ${ae} WITH(NOLOCK)
     WHERE ISJSON(PAYLOAD_JSON) = 1
       AND JSON_VALUE(PAYLOAD_JSON, '$.compania') = ${compania}
     ORDER BY FECHA_EVENTO DESC`;

  return rows.map((r) => {
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
      compania: typeof payload.compania === "string" ? payload.compania : (compania ?? ""),
    };
  });
}

export const auditRepository = { record, list };
