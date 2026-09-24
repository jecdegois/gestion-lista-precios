import { apiServiceResult, withIdentidad } from "@/shared/api";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

/** Listas de Gestión Global y niveles de precio de la compañía en sesion. */
export const GET = withIdentidad(async (_req, identidad) =>
  apiServiceResult(await solicitudesService.catalogoGestionGlobal(identidad)),
);
