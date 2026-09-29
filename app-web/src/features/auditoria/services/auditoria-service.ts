import { auditRepository, type AuditListParams } from "../repository/audit-repository";
import type { Identidad } from "@/lib/domain-types";

export type AuditQueryParams = Omit<AuditListParams, "compania">;

export const auditoriaService = {
  /** Eventos del flujo maker-checker de la compañía en sesión, con paginación y filtros. */
  async listarEventos(identidad: Identidad, params: AuditQueryParams = {}) {
    if (!identidad.compania) return { ok: false as const, error: "La sesión no tiene una compañía asignada." };
    const result = await auditRepository.list({ compania: identidad.compania, ...params });
    return { ok: true as const, ...result };
  },
};
