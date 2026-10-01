import type { AuthContext, Identidad, RoleCode } from "@/shared/types/domain-types";
import { getSessionContext } from "@/server/auth-guard";

export async function getServerSession() {
  return getSessionContext();
}

type AuthResult = { session: AuthContext; isAuth: true } | { session: null; isAuth: false };

export async function requireAuth(): Promise<AuthResult> {
  const session = await getServerSession();

  return session ? { session, isAuth: true } : { session: null, isAuth: false };
}

const ROL_POR_CODIGO: Record<RoleCode, Identidad["rol"]> = {
  operator: "OPERADOR",
  approver: "APROBADOR",
  auditor: "AUDITOR",
};

/** Identidad del portal en la empresa activa de la sesión (o la primera asignada). */
export function getIdentidad(session: AuthContext): Identidad {
  const asignacion = session.companies.find((c) => c.company === session.activeCompany) ?? session.companies[0];
  return {
    email: session.email,
    nombre: session.fullName,
    rol: asignacion ? ROL_POR_CODIGO[asignacion.role] : "SIN_PERMISO",
    color: "#52525b",
    compania: asignacion?.company ?? null,
    companias: [...new Set(session.companies.map((c) => c.company))],
    moneda: asignacion?.currencySymbol ?? "",
    brandColor: asignacion?.brandColor,
    isAdmin: session.isAdmin,
  };
}

/** Identidad de la sesion actual, o null si no hay sesion valida. */
export async function getIdentidadActual(): Promise<Identidad | null> {
  const session = await getServerSession();
  return session ? getIdentidad(session) : null;
}
