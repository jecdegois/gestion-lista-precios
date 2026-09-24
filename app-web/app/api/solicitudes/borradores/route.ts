import { apiBadRequest, apiServiceResult, parseJsonBody, withIdentidad } from "@/shared/api";
import { SolicitudSchema } from "@/features/solicitudes/schemas/solicitud-schema";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Guarda la solicitud como borrador (sin enviar a aprobacion). */
export const POST = withIdentidad(async (req, identidad) => {
  const parsed = SolicitudSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiBadRequest("Datos inválidos");

  return apiServiceResult(await solicitudesService.guardarBorrador(identidad, parsed.data));
});
