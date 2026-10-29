import { redirect } from "next/navigation";
import { getIdentidad, requireAuth } from "@/server/session";
import { puedeEjecutar } from "@/features/ejecucion/permissions";

/**
 * Guard de acceso para el módulo de Ejecución.
 *
 * La regla vive en `puedeEjecutar` (también la aplican el menú y el service).
 */
export default async function EjecucionLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { isAuth, session } = await requireAuth();
  if (!isAuth) redirect("/auth/login");

  const user = getIdentidad(session);

  if (!puedeEjecutar(user)) redirect("/");

  return (
    <>
      <h1 className="text-xl font-bold text-zinc-900 mb-4">Ejecución Manual de Actualizciones</h1>
      {children}
    </>
  );
}
