import PortalApp from "@/components/PortalApp";
import { esModoDemo, esModoSoloLectura, esModoSoloPortal } from "@/server/companies";
import { requireSession } from "@/server/auth-guard";
import type { Identidad, RoleCode } from "@/lib/domain-types";

const ROL_POR_CODIGO: Record<RoleCode, Identidad["rol"]> = {
  operator: "OPERADOR",
  approver: "APROBADOR",
  auditor: "AUDITOR",
};

function identidadDesdeSesion(session: {
  email: string;
  fullName: string;
  companies: { company: string; role: RoleCode }[];
}): Identidad {
  const asignacion = session.companies[0];
  return {
    email: session.email,
    nombre: session.fullName,
    rol: asignacion ? ROL_POR_CODIGO[asignacion.role] : "SIN_PERMISO",
    color: "#52525b",
    compania: asignacion?.company ?? null,
  };
}

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requireSession();

  return (
    <PortalApp
      initialUser={identidadDesdeSesion(session)}
      demo={esModoDemo()}
      readOnly={esModoSoloLectura()}
      portalOnly={esModoSoloPortal()}
    />
  );
}
