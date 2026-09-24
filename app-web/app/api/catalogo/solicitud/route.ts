import { apiServiceResult, withIdentidad } from "@/shared/api";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Niveles de precio de la compañía en sesion; `?articulos=1` incluye el catálogo del `?nivel=`. */
export const GET = withIdentidad(async (req, identidad) => {
  const params = new URL(req.url).searchParams;
  const nivel = params.get("nivel")?.trim() || undefined;
  return apiServiceResult(
    await solicitudesService.catalogoSolicitud(identidad, nivel, params.get("articulos") === "1"),
  );
});
