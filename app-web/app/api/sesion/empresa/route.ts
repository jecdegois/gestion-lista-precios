import { apiBadRequest, apiError, apiOk, apiUnauthorized, parseJsonBody, withApiRoute } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { authRepository } from "@/features/auth/repository/auth-repository";
import { getServerSession } from "@/server/session";

/** Cambia la empresa activa de la sesión; solo entre las empresas asignadas al usuario. */
export const POST = withApiRoute(async (req: Request) => {
  const session = await getServerSession();
  if (!session) return apiUnauthorized("Sesión no válida");

  const body = await parseJsonBody<{ company?: unknown }>(req);
  const company = typeof body?.company === "string" ? body.company.trim().toUpperCase() : "";
  if (!company) return apiBadRequest("Indique la compañía");
  if (!session.companies.some((c) => c.company === company)) return apiError("No tiene acceso a esa compañía", 403);

  await authRepository.sessions.setActiveCompany(session.sessionId, company);
  const ctx = requestContext(req);
  await authRepository.audit.record({
    event: "active_company_changed",
    actorId: session.userId,
    actorEmail: session.email,
    company,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
    details: { from: session.activeCompany },
  });
  return apiOk({ company }, `Compañía activa: ${company}`);
});
