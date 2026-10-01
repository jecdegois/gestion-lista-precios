"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import UserMenu from "@/shared/components/layout/UserMenu";
import { roleLabel } from "@/shared/utils/format";
import { setActiveCompany, signOut } from "@/features/auth/api/auth-api";
import type { Identidad } from "@/shared/types/domain-types";
import { notify } from "@/shared/notifications/notify";

type NavItem = { key: string; label: string; href: string; visible: (user: Identidad) => boolean };

const NAV_ITEMS: NavItem[] = [
  { key: "nueva", label: "Nueva Solicitud", href: "/solicitudes/nueva", visible: (u) => u.rol !== "AUDITOR" && u.rol !== "SIN_PERMISO" },
  { key: "bandeja", label: "Bandeja de Aprobación", href: "/solicitudes/bandeja", visible: (u) => u.rol !== "SIN_PERMISO" },
  // TODO: cuando el cliente defina el rol EJECUTOR, agregar aquí: u.rol === "EJECUTOR"
  { key: "ejecucion", label: "Ejecución", href: "/ejecucion", visible: (u) => u.rol === "APROBADOR" || !!u.isAdmin },
  { key: "auditoria", label: "Auditoría", href: "/auditoria", visible: (u) => u.rol !== "SIN_PERMISO" },
  { key: "settings", label: "Configuración", href: "/configuracion", visible: (u) => !!u.isAdmin },
];

function navActiva(pathname: string): string | null {
  if (pathname.startsWith("/solicitudes/nueva")) return "nueva";
  if (pathname.startsWith("/solicitudes/bandeja")) return "bandeja";
  if (pathname.startsWith("/ejecucion")) return "ejecucion";
  if (pathname.startsWith("/auditoria")) return "auditoria";
  if (pathname.startsWith("/configuracion")) return "settings";
  return null;
}

export default function Header({ user }: { user: Identidad }) {
  const router = useRouter();
  const activa = navActiva(usePathname());

  const [switching, setSwitching] = useState(false);

  async function handleCompanyChange(company: string) {
    setSwitching(true);
    const res = await setActiveCompany(company);
    // El layout recalcula la identidad: esquema SQL, color y moneda de la nueva empresa.
    if (res.ok) router.refresh();
    else notify.error(res.error ?? "No se pudo cambiar la compañía");
    setSwitching(false);
  }

  async function handleLogout() {
    await signOut();
    router.push("/auth/login");
  }

  return (
    <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap lg:flex-nowrap">
        {/* min-w-0: en escritorio el título se recorta antes de bajar el selector de empresa a otra línea. */}
        <div className="flex items-center gap-3 min-w-0">
          {user.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo servido por la API, fuera de next/image
            <img src={user.logoUrl} alt={`Logo de ${user.compania ?? "la compañía"}`} className="flex-none h-9 w-auto max-w-[96px] object-contain" />
          ) : (
            <div className="flex-none w-9 h-9 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] font-bold flex items-center justify-center">GP</div>
          )}
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-zinc-900 truncate">Gestión Masiva de Precios</h1>
            <p className="text-xs text-zinc-500 truncate" title="Integración con Softland · Prototipo interactivo">
              Integración con Softland · Prototipo interactivo
            </p>
          </div>
        </div>

        {(user.rol !== "SIN_PERMISO" || user.isAdmin) && (
          <nav className="flex items-center gap-1 flex-wrap lg:flex-nowrap flex-none">
            {NAV_ITEMS.filter((item) => item.visible(user)).map((item) => (
              <Link key={item.key} href={item.href} className={"nav-link" + (activa === item.key ? " active" : "")}>
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2 flex-none">
          <div className="text-right">
            <p className="text-xs font-semibold text-zinc-900">{user.nombre}</p>
            <p className="text-[11px] text-zinc-500">
              {roleLabel(user)}
              {(user.companias?.length ?? 0) < 2 && user.compania ? " · " + user.compania : ""}
            </p>
            {user.companias && user.companias.length > 1 && (
              <select
                className="text-[11px] font-semibold text-zinc-700 bg-transparent border border-zinc-200 rounded px-1 py-0.5 cursor-pointer"
                aria-label="Compañía activa"
                value={user.compania ?? ""}
                disabled={switching}
                onChange={(e) => void handleCompanyChange(e.target.value)}
              >
                {user.companias.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            )}
          </div>
          <UserMenu name={user.nombre} onLogout={handleLogout} />
        </div>
      </div>
    </header>
  );
}
