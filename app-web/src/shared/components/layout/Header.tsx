"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon, { initials } from "@/components/Icon";
import { signOut } from "@/features/auth/api/auth-api";
import type { Identidad } from "@/lib/domain-types";

type NavItem = { key: string; label: string; href: string; visible: (user: Identidad) => boolean };

const NAV_ITEMS: NavItem[] = [
  { key: "nueva", label: "Nueva Solicitud", href: "/solicitudes/nueva", visible: (u) => u.rol !== "AUDITOR" && u.rol !== "SIN_PERMISO" },
  { key: "bandeja", label: "Bandeja de Aprobación", href: "/solicitudes/bandeja", visible: (u) => u.rol !== "SIN_PERMISO" },
  { key: "ejecucion", label: "Ejecución", href: "/ejecucion", visible: (u) => u.rol === "APROBADOR" || u.rol === "AUDITOR" || !!u.isAdmin },
  { key: "auditoria", label: "Auditoría", href: "/auditoria", visible: (u) => u.rol !== "SIN_PERMISO" },
  { key: "users", label: "Usuarios", href: "/usuarios", visible: (u) => !!u.isAdmin },
];

function navActiva(pathname: string): string | null {
  if (pathname.startsWith("/solicitudes/nueva")) return "nueva";
  if (pathname.startsWith("/solicitudes/bandeja")) return "bandeja";
  if (pathname.startsWith("/ejecucion")) return "ejecucion";
  if (pathname.startsWith("/auditoria")) return "auditoria";
  if (pathname.startsWith("/usuarios")) return "users";
  return null;
}

export default function Header({ user }: { user: Identidad }) {
  const router = useRouter();
  const activa = navActiva(usePathname());

  async function handleLogout() {
    await signOut();
    router.push("/auth/login");
  }

  return (
    <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-900 text-white font-bold flex items-center justify-center">GP</div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-900">Gestión Masiva de Precios</h1>
            <p className="text-xs text-zinc-500">Integración con Softland · Prototipo interactivo</p>
          </div>
        </div>

        {(user.rol !== "SIN_PERMISO" || user.isAdmin) && (
          <nav className="flex items-center gap-1 flex-wrap">
            {NAV_ITEMS.filter((item) => item.visible(user)).map((item) => (
              <Link key={item.key} href={item.href} className={"nav-link" + (activa === item.key ? " active" : "")}>
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <span className="avatar w-8 h-8 text-[11px]" style={{ background: user.color }}>
            {initials(user.nombre)}
          </span>
          <div className="text-right">
            <p className="text-xs font-semibold text-zinc-900">{user.nombre}</p>
            <p className="text-[11px] text-zinc-500">
              {user.rol === "SIN_PERMISO" && user.isAdmin ? "ADMINISTRADOR" : user.rol.replace("_", " ")}
              {user.compania ? " · " + user.compania : ""}
            </p>
          </div>
          <button className="btn btn-ghost" title="Cerrar sesión" onClick={handleLogout}>
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
