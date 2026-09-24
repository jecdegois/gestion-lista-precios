import { apiBadRequest, apiServiceResult, parseJsonBody, withIdentidad } from "@/shared/api";
import { RechazoSchema } from "@/features/solicitudes/schemas/solicitud-schema";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Rechaza una solicitud con motivo obligatorio. */
export const POST = withIdentidad<{ params: { id: string } }>(async (req, identidad, { params }) => {
  const parsed = RechazoSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiBadRequest(parsed.error.issues[0]?.message ?? "Datos inválidos");

  return apiServiceResult(await solicitudesService.rechazar(identidad, params.id, parsed.data));
});
