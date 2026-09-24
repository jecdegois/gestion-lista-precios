import { apiBadRequest, apiServiceResult, parseJsonBody, withIdentidad } from "@/shared/api";
import { CancelacionSchema } from "@/features/solicitudes/schemas/solicitud-schema";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Solicita la cancelacion de una solicitud PENDIENTE del usuario en sesion. */
export const POST = withIdentidad<{ params: { id: string } }>(async (req, identidad, { params }) => {
  const parsed = CancelacionSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiBadRequest(parsed.error.issues[0]?.message ?? "Datos inválidos");

  return apiServiceResult(await solicitudesService.solicitarCancelacion(identidad, params.id, parsed.data));
});
