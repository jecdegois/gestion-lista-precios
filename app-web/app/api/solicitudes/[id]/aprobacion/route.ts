import { apiServiceResult, withIdentidad } from "@/shared/api";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Aprueba una solicitud PENDIENTE de otro usuario de la compañía. */
export const POST = withIdentidad<{ params: Promise<{ id: string }> }>(async (_req, identidad, { params }) => {
  console.info("[API /aprobacion] Handler iniciado");
  const { id } = await params;
  console.info("[API /aprobacion] Recibida solicitud de aprobación", { id, email: identidad.email });
  const resultado = await solicitudesService.aprobar(identidad, id);
  console.info("[API /aprobacion] Resultado del service", { ok: resultado.ok, error: resultado.error });
  return apiServiceResult(resultado);
});
