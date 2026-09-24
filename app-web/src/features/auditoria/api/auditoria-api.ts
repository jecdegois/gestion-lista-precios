import { GENERIC_NETWORK_ERROR, GENERIC_SERVER_ERROR, type ApiResult } from "@/shared/api/api-types";
import type { EventoAuditoria } from "@/lib/domain-types";

export async function getEventos(): Promise<ApiResult<{ eventos: EventoAuditoria[] }>> {
  try {
    const res = await fetch("/api/auditoria", { cache: "no-store" });
    const json = (await res.json()) as ApiResult<{ eventos: EventoAuditoria[] }>;
    return typeof json.ok === "boolean" ? json : { ok: false, error: GENERIC_SERVER_ERROR };
  } catch {
    return { ok: false, error: GENERIC_NETWORK_ERROR };
  }
}
