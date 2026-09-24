import { redirect } from "next/navigation";
import { getIdentidad, requireAuth } from "@/utils/auth";

const INICIO_POR_ROL = {
  OPERADOR: "/solicitudes/nueva",
  APROBADOR: "/solicitudes/bandeja",
  AUDITOR: "/auditoria",
  SIN_PERMISO: "/auditoria",
} as const;

/** `/` solo redirige a la página de inicio del rol (el layout muestra el 403 si no tiene permiso). */
export default async function HomePage() {
  const { isAuth, session } = await requireAuth();
  if (!isAuth) redirect("/auth/login");

  const identidad = getIdentidad(session);
  redirect(identidad.rol === "SIN_PERMISO" && identidad.isAdmin ? "/usuarios" : INICIO_POR_ROL[identidad.rol]);
}
