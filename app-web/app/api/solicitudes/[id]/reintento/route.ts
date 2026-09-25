import { apiServiceResult, withIdentidad } from "@/shared/api";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Reintenta una solicitud únicamente cuando terminó en ERROR_EJECUCION. */
export const POST = withIdentidad<{ params: { id: string } }>(async (_req, identidad, { params }) =>
  apiServiceResult(await solicitudesService.reintentar(identidad, params.id)),
);
