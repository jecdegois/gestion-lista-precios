import { GENERIC_NETWORK_ERROR, GENERIC_SERVER_ERROR, type ApiResult } from "@/shared/api/api-types";
import type { EventoAuditoria } from "@/lib/domain-types";
import { AUDIT_PAGE_SIZE } from "../audit-constants";

export type AuditApiParams = {
  offset?: number;
  limit?: number;
  rol?: string;
  evento?: string;
  search?: string;
};

export type AuditApiResponse = {
  eventos: EventoAuditoria[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export async function getEventos(
  params: AuditApiParams = {},
): Promise<ApiResult<AuditApiResponse>> {
  try {
    const sp = new URLSearchParams();
    if (params.offset != null) sp.set("offset", String(params.offset));
    if (params.limit != null) sp.set("limit", String(params.limit));
    else sp.set("limit", String(AUDIT_PAGE_SIZE));
    if (params.rol) sp.set("rol", params.rol);
    if (params.evento) sp.set("evento", params.evento);
    if (params.search?.trim()) sp.set("search", params.search.trim());

    const res = await fetch(`/api/auditoria?${sp.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as ApiResult<AuditApiResponse>;
    return typeof json.ok === "boolean" ? json : { ok: false, error: GENERIC_SERVER_ERROR };
  } catch {
    return { ok: false, error: GENERIC_NETWORK_ERROR };
  }
}
