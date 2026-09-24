import { redirect } from "next/navigation";
import { requireAuth } from "@/utils/auth";

/** Solo el administrador global gestiona usuarios; las APIs lo exigen igual con `withAdmin`. */
export default async function UsersLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { isAuth, session } = await requireAuth();
  if (!isAuth) redirect("/auth/login");
  if (!session.isAdmin) redirect("/");

  return (
    <>
      <h1 className="text-xl font-bold text-zinc-900 mb-1">Gestión de usuarios</h1>
      <p className="text-sm text-zinc-500 mb-4">Altas, aprobación de solicitudes de acceso, permisos por compañía y bajas.</p>
      {children}
    </>
  );
}
