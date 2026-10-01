"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/configuracion", label: "Compañías" },
  { href: "/configuracion/usuarios", label: "Usuarios" },
];

/** Secciones de Configuración como subrutas (Usuarios incluye sus pendientes). */
export default function SettingsTabs() {
  const pathname = usePathname();
  const active = pathname.startsWith("/configuracion/usuarios") ? "/configuracion/usuarios" : "/configuracion";

  return (
    <nav className="flex gap-2 mb-4" aria-label="Secciones de configuración">
      {SECTIONS.map((s) => (
        <Link key={s.href} href={s.href} className={"subtab" + (active === s.href ? " active" : "")}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
