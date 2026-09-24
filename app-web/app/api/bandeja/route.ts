import { apiServiceResult, withIdentidad } from "@/shared/api";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Solicitudes enviadas de la compañía en sesion (bandeja de aprobación). */
export const GET = withIdentidad(async (_req, identidad) =>
  apiServiceResult(await solicitudesService.listarBandeja(identidad)),
);
