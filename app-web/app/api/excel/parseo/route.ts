import { apiBadRequest, apiServiceResult, withIdentidad } from "@/shared/api";
import { ProcesoSchema } from "@/features/solicitudes/schemas/solicitud-schema";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Parsea una plantilla .xlsx (multipart: proceso, nivelPrecio?, archivo). */
export const POST = withIdentidad(async (req, identidad) => {
  const formData = await req.formData().catch(() => null);
  if (!formData || !ProcesoSchema.safeParse(formData.get("proceso")).success) {
    return apiBadRequest("Datos inválidos");
  }

  return apiServiceResult(await solicitudesService.parsearExcel(identidad, formData));
});
