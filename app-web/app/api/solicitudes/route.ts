import { apiBadRequest, apiServiceResult, parseJsonBody, withIdentidad } from "@/shared/api";
import { ProcesoSchema, SolicitudSchema } from "@/features/solicitudes/schemas/solicitud-schema";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

const INVALID_INPUT = "Datos inválidos";

/** Solicitudes del usuario en sesion; `?proceso=` filtra por tipo. Paginadas por cabecera. */
export const GET = withIdentidad(async (req, identidad) => {
  const url = new URL(req.url);
  const proceso = url.searchParams.get("proceso");
  const parsed = ProcesoSchema.optional().safeParse(proceso ?? undefined);
  if (!parsed.success) return apiBadRequest(INVALID_INPUT);

  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1), 100);

  return apiServiceResult(await solicitudesService.listarMiasPaginado(identidad, parsed.data, offset, limit));
});

/** Envia una solicitud nueva a aprobacion. */
export const POST = withIdentidad(async (req, identidad) => {
  const parsed = SolicitudSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiBadRequest(INVALID_INPUT);

  return apiServiceResult(await solicitudesService.enviar(identidad, parsed.data));
});
