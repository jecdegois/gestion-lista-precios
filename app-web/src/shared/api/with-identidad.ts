import type { Identidad } from "@/lib/domain-types";
import { getIdentidadActual } from "@/utils/auth";
import { apiError, apiUnauthorized, withApiRoute } from "./api-response";

/**
 * Como `withApiRoute`, pero exige una sesion valida con rol y entrega la
 * identidad del servidor al handler (401 sin sesion, 403 sin permiso).
 */
export function withIdentidad<C = unknown>(
  handler: (req: Request, identidad: Identidad, ctx: C) => Promise<Response>,
): (req: Request, ctx: C) => Promise<Response> {
  return (req, ctx) =>
    withApiRoute(async (r: Request) => {
      const identidad = await getIdentidadActual();
      if (!identidad) return apiUnauthorized("Sesión no válida");
      if (identidad.rol === "SIN_PERMISO") return apiError("Acceso denegado", 403);
      return handler(r, identidad, ctx);
    })(req);
}
