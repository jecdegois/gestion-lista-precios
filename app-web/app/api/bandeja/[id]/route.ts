import { apiError, apiServiceResult, withIdentidad } from "@/shared/api";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Detalle completo de una solicitud (cabecera + filas) para el modal de revisión. */
export const GET = withIdentidad<{ params: Promise<{ id: string }> }>(
  async (_req, identidad, { params }) => {
    const { id } = await params;
    if (!id) return apiError("ID de solicitud requerido.", 400);
    return apiServiceResult(await solicitudesService.obtenerSolicitudDetalle(identidad, id));
  },
);
