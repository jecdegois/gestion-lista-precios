import { apiServiceResult, withIdentidad } from "@/shared/api";
import { ejecucionRepository } from "@/features/ejecucion/repository/ejecucion-repository";

const AUDIT_EXEC_PAGE_SIZE = 50;

/** Ejecuciones directas paginadas para el módulo de Auditoría. */
export const GET = withIdentidad(async (req, identidad) => {
  if (!identidad.compania) {
    return apiServiceResult({ ok: false as const, error: "La sesión no tiene una compañía asignada." });
  }

  const url = new URL(req.url);
  const sp = url.searchParams;

  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0);
  const limit  = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? String(AUDIT_EXEC_PAGE_SIZE), 10) || AUDIT_EXEC_PAGE_SIZE));
  const tipo   = sp.get("tipo")   ?? undefined;
  const estado = sp.get("estado") ?? undefined;
  const search = sp.get("search")?.trim() || undefined;

  const result = await ejecucionRepository.listarAudit({
    compania: identidad.compania,
    offset,
    limit,
    tipo,
    estado,
    search,
  });

  return apiServiceResult({ ok: true as const, ...result });
});
