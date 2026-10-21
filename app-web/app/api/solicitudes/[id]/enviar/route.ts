import { apiServiceResult, withIdentidad } from "@/shared/api";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Envia a aprobacion un borrador del usuario en sesion. */
export const POST = withIdentidad<{ params: Promise<{ id: string }> }>(async (_req, identidad, { params }) =>
  apiServiceResult(await solicitudesService.enviarBorrador(identidad, (await params).id)),
);
