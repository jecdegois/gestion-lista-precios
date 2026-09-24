import { apiBadRequest, apiServiceResult, parseJsonBody, withIdentidad } from "@/shared/api";
import { SimularManualSchema } from "@/features/solicitudes/schemas/solicitud-schema";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Simulacion manual de Precio Base y Descuento (previsualizacion; no toca la BD). */
export const POST = withIdentidad(async (req, identidad) => {
  const parsed = SimularManualSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiBadRequest("Datos inválidos");

  return apiServiceResult(await solicitudesService.simularManual(identidad, parsed.data));
});
