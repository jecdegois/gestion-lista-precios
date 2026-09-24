import { apiServiceResult, withIdentidad } from "@/shared/api";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Registra que el aprobador revisó la simulación de una solicitud PENDIENTE. */
export const POST = withIdentidad<{ params: { id: string } }>(async (_req, identidad, { params }) =>
  apiServiceResult(await solicitudesService.registrarRevision(identidad, params.id)),
);
