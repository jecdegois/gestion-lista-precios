import { apiServiceResult, withIdentidad } from "@/shared/api";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Aprueba una solicitud PENDIENTE de otro usuario de la compañía. */
export const POST = withIdentidad<{ params: { id: string } }>(async (_req, identidad, { params }) =>
  apiServiceResult(await solicitudesService.aprobar(identidad, params.id)),
);
