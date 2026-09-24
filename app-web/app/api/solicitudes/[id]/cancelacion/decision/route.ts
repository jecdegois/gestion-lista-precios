import { apiBadRequest, apiServiceResult, parseJsonBody, withIdentidad } from "@/shared/api";
import { DecisionCancelacionSchema } from "@/features/solicitudes/schemas/solicitud-schema";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** El aprobador confirma o deniega una cancelación solicitada. */
export const POST = withIdentidad<{ params: { id: string } }>(async (req, identidad, { params }) => {
  const parsed = DecisionCancelacionSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiBadRequest("Datos inválidos");

  return apiServiceResult(await solicitudesService.decidirCancelacion(identidad, params.id, parsed.data));
});
