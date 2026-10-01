import { redirect } from "next/navigation";
import SettingsTabs from "@/features/settings/components/SettingsTabs";
import { requireAuth } from "@/server/session";

/** Solo el administrador global configura la aplicación (compañías y usuarios); las APIs lo exigen igual con `withAdmin`. */
export default async function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { isAuth, session } = await requireAuth();
  if (!isAuth) redirect("/auth/login");
  if (!session.isAdmin) redirect("/");

  return (
    <>
      <h1 className="text-xl font-bold text-zinc-900 mb-1">Configuración</h1>
      <p className="text-sm text-zinc-500 mb-4">Compañías (moneda y color de marca) y gestión de usuarios.</p>
      <SettingsTabs />
      {children}
    </>
  );
}
