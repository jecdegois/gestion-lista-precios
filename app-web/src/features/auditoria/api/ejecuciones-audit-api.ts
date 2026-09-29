import { GENERIC_NETWORK_ERROR, GENERIC_SERVER_ERROR, type ApiResult } from "@/shared/api/api-types";
import type { EjecucionLog } from "@/lib/domain-types";

export const AUDIT_EXEC_PAGE_SIZE = 50;

export type EjecucionesAuditParams = {
  offset?: number;
  limit?: number;
  tipo?: string;
  estado?: string;
  search?: string;
};

export type EjecucionesAuditResponse = {
  ejecuciones: EjecucionLog[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export async function getEjecucionesAudit(
  params: EjecucionesAuditParams = {},
): Promise<ApiResult<EjecucionesAuditResponse>> {
  try {
    const sp = new URLSearchParams();
    sp.set("limit", String(params.limit ?? AUDIT_EXEC_PAGE_SIZE));
    if (params.offset != null) sp.set("offset", String(params.offset));
    if (params.tipo)           sp.set("tipo",   params.tipo);
    if (params.estado)         sp.set("estado", params.estado);
    if (params.search?.trim()) sp.set("search", params.search.trim());

    const res  = await fetch(`/api/auditoria/ejecuciones?${sp.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as ApiResult<EjecucionesAuditResponse>;
    return typeof json.ok === "boolean" ? json : { ok: false, error: GENERIC_SERVER_ERROR };
  } catch {
    return { ok: false, error: GENERIC_NETWORK_ERROR };
  }
}
