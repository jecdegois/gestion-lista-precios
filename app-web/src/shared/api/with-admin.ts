import type { AuthContext } from "@/shared/types/domain-types";
import { authRepository } from "@/features/auth/repository/auth-repository";
import { getServerSession } from "@/server/session";
import { apiError, apiUnauthorized, withApiRoute } from "./api-response";
import { MUST_CHANGE_PASSWORD_ERROR } from "./with-identidad";

/**
 * Como `withIdentidad`, pero exige administrador global y entrega el contexto de
 * sesion completo (401 sin sesion, 403 si no es admin, con `access_denied`).
 */
export function withAdmin<C = unknown>(
  handler: (req: Request, session: AuthContext, ctx: C) => Promise<Response>,
): (req: Request, ctx: C) => Promise<Response> {
  return (req, ctx) =>
    withApiRoute(async (r: Request) => {
      const session = await getServerSession();
      if (!session) return apiUnauthorized("Sesión no válida");
      if (session.mustChangePassword) return apiError(MUST_CHANGE_PASSWORD_ERROR, 403);
      if (!session.isAdmin) {
        await authRepository.audit.record({
          event: "access_denied",
          actorId: session.userId,
          actorEmail: session.email,
          details: { path: new URL(r.url).pathname },
        });
        return apiError("Acceso denegado", 403);
      }
      return handler(r, session, ctx);
    })(req);
}
