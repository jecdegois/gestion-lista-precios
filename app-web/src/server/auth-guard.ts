import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthContext, RoleCode } from "@/lib/domain-types";
import { authService } from "@/features/auth/services/auth-service";
import { authRepository } from "@/features/auth/repository/auth-repository";
import { SESSION_COOKIE_NAME } from "@/features/auth/session-cookie";

export async function getSessionContext(): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const resolved = await authService.resolveContext(token);
  if (!resolved) return null;

  return {
    sessionId: resolved.sessionId,
    expiresAt: resolved.expiresAt,
    userId: resolved.user.id,
    email: resolved.user.email,
    fullName: resolved.user.fullName,
    isAdmin: resolved.user.isAdmin,
    mustChangePassword: resolved.user.mustChangePassword,
    companies: resolved.user.companies.map((assignment) => ({
      company: assignment.company,
      currencySymbol: assignment.currencySymbol,
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
