import { redirect } from "next/navigation";
import Header from "@/shared/components/layout/Header";
import PortalProviders from "@/shared/components/layout/PortalProviders";
import Vista403 from "@/shared/components/layout/Vista403";
import { esModoDemo } from "@/server/companies";
import { getIdentidad, requireAuth } from "@/utils/auth";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { isAuth, session } = await requireAuth();
  if (!isAuth) redirect("/auth/login");

  const user = getIdentidad(session);

  return (
    <PortalProviders user={user}>
      <div className="min-h-screen">
        <Header user={user} />
        {user.rol === "SIN_PERMISO" && !user.isAdmin ? (
          <Vista403 user={user} />
        ) : (
          <main className="max-w-6xl mx-auto px-6 py-6">
            {esModoDemo() && (
              <div className="mb-4 inline-block badge badge-outline" title="Sin conexión a SQL Server; catálogo en memoria">
                Modo demo (sin SQL Server)
              </div>
            )}
            {children}
          </main>
        )}
      </div>
    </PortalProviders>
  );
}
