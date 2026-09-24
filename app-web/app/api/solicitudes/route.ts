import { apiBadRequest, apiServiceResult, parseJsonBody, withIdentidad } from "@/shared/api";
import { ProcesoSchema, SolicitudSchema } from "@/features/solicitudes/schemas/solicitud-schema";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

const INVALID_INPUT = "Datos inválidos";

/** Solicitudes del usuario en sesion; `?proceso=` filtra por tipo. */
export const GET = withIdentidad(async (req, identidad) => {
  const proceso = new URL(req.url).searchParams.get("proceso");
  const parsed = ProcesoSchema.optional().safeParse(proceso ?? undefined);
  if (!parsed.success) return apiBadRequest(INVALID_INPUT);

  return apiServiceResult(await solicitudesService.listarMias(identidad, parsed.data));
});

/** Envia una solicitud nueva a aprobacion. */
export const POST = withIdentidad(async (req, identidad) => {
  const parsed = SolicitudSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiBadRequest(INVALID_INPUT);

  return apiServiceResult(await solicitudesService.enviar(identidad, parsed.data));
});
