import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthContext, RoleCode } from "@/shared/types/domain-types";
import { authService } from "@/features/auth/services/auth-service";
import { authRepository } from "@/features/auth/repository/auth-repository";
import { SESSION_COOKIE_NAME } from "@/features/auth/session-cookie";
import { cargarCompanias, esModoDemo, resolverCompania } from "./companies";
import { esquemasExistentesCache } from "./db";

type Esquemas = Awaited<ReturnType<typeof esquemasExistentesCache>>;

/**
 * Una compañía sin esquema en Softland o en PORTAL_PRECIOS no puede operar: se quita de la sesión, así no
 * aparece en el selector del header ni puede activarse. Si no se pudo verificar (esquemas null), no se filtra.
 */
function operable(company: string, esquemas: Esquemas | null): boolean {
  if (!esquemas) return true;
  try {
    const { schema } = resolverCompania(company);
    return esquemas.softland.has(schema) && esquemas.portal.has(schema);
  } catch {
    return false;
  }
}

export async function getSessionContext(): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  // Las compañías (esquema SQL de cada una) se leen de Postgres; los repositorios las resuelven en síncrono.
  const [resolved, esquemas] = await Promise.all([
    authService.resolveContext(token),
    cargarCompanias().then(() => (esModoDemo() ? null : esquemasExistentesCache())).catch((error) => {
      console.error("[sesion] no se pudieron verificar los esquemas en SQL Server:", error);
      return null;
    }),
  ]);
  if (!resolved) return null;

  return {
    sessionId: resolved.sessionId,
    expiresAt: resolved.expiresAt,
    activeCompany: resolved.activeCompany,
    userId: resolved.user.id,
    email: resolved.user.email,
    fullName: resolved.user.fullName,
    isAdmin: resolved.user.isAdmin,
    mustChangePassword: resolved.user.mustChangePassword,
    companies: resolved.user.companies.filter((assignment) => operable(assignment.company, esquemas)).map((assignment) => ({
      company: assignment.company,
      currencySymbol: assignment.currencySymbol,
      brandColor: assignment.brandColor,
      logoUrl: assignment.logoUrl,
      role: assignment.role as RoleCode,
    })),
  };
}

export async function requireSession(): Promise<AuthContext> {
  const context = await getSessionContext();
  if (!context) redirect("/auth/login");
  return context;
}

export class PermissionDenied extends Error {
  constructor() {
    super("Acceso denegado");
  }
}

export async function assertRole(
  context: AuthContext,
  company: string | undefined,
  roles: RoleCode[],
): Promise<void> {
  if (context.isAdmin) return;

  const hasRole =
    !!company &&
    context.companies.some(
      (assignment) => assignment.company === company && roles.includes(assignment.role),
    );

  if (!hasRole) {
    await authRepository.audit.record({
      event: "access_denied",
      actorId: context.userId,
      actorEmail: context.email,
      company,
    });
    throw new PermissionDenied();
  }
}
