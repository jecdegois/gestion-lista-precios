import type { Identidad } from "@/shared/types/domain-types";
import { getIdentidad, getServerSession } from "@/server/session";
import { apiError, apiUnauthorized, withApiRoute } from "./api-response";

/** Con contraseña temporal solo se permite cambiarla (lo exige también el layout del portal). */
export const MUST_CHANGE_PASSWORD_ERROR = "Debe cambiar su contraseña temporal";

/**
 * Como `withApiRoute`, pero exige una sesion valida con rol y entrega la
 * identidad del servidor al handler (401 sin sesion, 403 sin permiso).
 */
export function withIdentidad<C = unknown>(
  handler: (req: Request, identidad: Identidad, ctx: C) => Promise<Response>,
): (req: Request, ctx: C) => Promise<Response> {
  return (req, ctx) =>
    withApiRoute(async (r: Request) => {
      const session = await getServerSession();
      if (!session) return apiUnauthorized("Sesión no válida");
      if (session.mustChangePassword) return apiError(MUST_CHANGE_PASSWORD_ERROR, 403);
      const identidad = getIdentidad(session);
      if (identidad.rol === "SIN_PERMISO") return apiError("Acceso denegado", 403);
      return handler(r, identidad, ctx);
    })(req);
}
