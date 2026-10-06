import { apiError, apiServiceResult, withIdentidad } from "@/shared/api";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/**
 * Hallazgos paginados de una solicitud (solo filas con advertencia de margen/costo).
 * Query params:
 *   - offset (default 0)
 *   - limit (default 50, max 200)
 */
export const GET = withIdentidad<{ params: Promise<{ id: string }> }>(
  async (req, identidad, { params }) => {
    const { id } = await params;
    if (!id) return apiError("ID de solicitud requerido.", 400);

    const url = new URL(req.url);
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));

    return apiServiceResult(
      await solicitudesService.obtenerSolicitudHallazgosPaginado(identidad, id, offset, limit),
    );
  },
);
