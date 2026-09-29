import { redirect } from "next/navigation";
import { getIdentidad, requireAuth } from "@/utils/auth";

/**
 * Guard de acceso para el módulo de Ejecución.
 *
 * Por ahora solo APROBADOR (y admin) puede acceder.
 * TODO: cuando el cliente defina el rol EJECUTOR, agregar aquí la condición.
 */
export default async function EjecucionLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { isAuth, session } = await requireAuth();
  if (!isAuth) redirect("/auth/login");

  const user = getIdentidad(session);

  // TODO: ampliar cuando exista rol EJECUTOR → user.rol === "EJECUTOR"
  const puedeVerEjecucion = user.rol === "APROBADOR" || !!user.isAdmin;

  if (!puedeVerEjecucion) redirect("/");

  return (
    <>
      <h1 className="text-xl font-bold text-zinc-900 mb-4">Ejecución de SPs</h1>
      {children}
    </>
  );
}
