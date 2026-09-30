import { apiServiceResult, withIdentidad } from "@/shared/api";
import { auditoriaService } from "@/features/auditoria/services/auditoria-service";
import { AUDIT_PAGE_SIZE } from "@/features/auditoria/repository/audit-repository";

/** Eventos de auditoría con paginación y filtros opcionales. */
export const GET = withIdentidad(async (req, identidad) => {
  const url = new URL(req.url);
  const sp = url.searchParams;

  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? String(AUDIT_PAGE_SIZE), 10) || AUDIT_PAGE_SIZE));
  const rol = sp.get("rol") ?? undefined;
  const evento = sp.get("evento") ?? undefined;
  const search = sp.get("search")?.trim() || undefined;

  return apiServiceResult(
    await auditoriaService.listarEventos(identidad, { offset, limit, rol, evento, search }),
  );
});
