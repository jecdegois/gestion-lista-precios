import { apiError, apiServiceResult, withIdentidad } from "@/shared/api";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/**
 * Cabecera de una solicitud para el modal de revisión.
 * Las filas se obtienen paginadas desde /api/bandeja/[id]/detalle.
 * 
 * NOTA: El parámetro headerOnly ya no es necesario - siempre retorna solo cabecera
 * para evitar cargar 10K+ filas en una sola query.
 */
export const GET = withIdentidad<{ params: Promise<{ id: string }> }>(
  async (req, identidad, { params }) => {
    const { id } = await params;
    if (!id) return apiError("ID de solicitud requerido.", 400);

    // Siempre retornar solo cabecera - las filas se cargan paginadas desde /detalle
    return apiServiceResult(await solicitudesService.obtenerSolicitudCabecera(identidad, id));
  },
);
