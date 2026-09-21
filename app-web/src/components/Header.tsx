"use client";

import Icon, { initials } from "./Icon";
import type { Identidad } from "@/lib/domain-types";

export type NavKey = "nueva" | "bandeja" | "auditoria";

export default function Header({
  user,
  onLogout,
  onNav,
  activeNav,
}: {
  user: Identidad;
  onLogout: () => void;
  onNav: (n: NavKey) => void;
  activeNav: NavKey;
}) {
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

        {user.rol !== "SIN_PERMISO" && (
          <nav className="flex items-center gap-1 flex-wrap">
            {user.rol !== "AUDITOR" && (
              <span className={"nav-link" + (activeNav === "nueva" ? " active" : "")} onClick={() => onNav("nueva")}>Nueva Solicitud</span>
            )}
            <span className={"nav-link" + (activeNav === "bandeja" ? " active" : "")} onClick={() => onNav("bandeja")}>Bandeja de Aprobación</span>
            <span className={"nav-link" + (activeNav === "auditoria" ? " active" : "")} onClick={() => onNav("auditoria")}>Auditoría</span>
          </nav>
        )}

        <div className="flex items-center gap-2">
          <span className="avatar w-8 h-8 text-[11px]" style={{ background: user.color }}>
            {initials(user.nombre)}
          </span>
          <div className="text-right">
            <p className="text-xs font-semibold text-zinc-900">{user.nombre}</p>
            <p className="text-[11px] text-zinc-500">
              {user.rol.replace("_", " ")}
              {user.compania ? " · " + user.compania : ""}
            </p>
          </div>
          <button className="btn btn-ghost" title="Cerrar sesión" onClick={onLogout}>
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

export function Vista403({ user }: { user: Identidad }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="card p-8 max-w-md text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <Icon name="shieldOff" className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 mb-1">403 — Acceso Denegado</h2>
        <p className="text-sm text-zinc-500 mb-4">
          La cuenta <span className="mono">{user.email}</span> no tiene permisos para acceder al módulo.
        </p>
        <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3 text-left text-xs text-zinc-600">
          <p><b>Inicio de sesión:</b> Corporativo (SSO) — Active Directory federado</p>
          <p className="mt-1"><b>Grupos requeridos:</b> Operador de Precios o Aprobador de Precios</p>
          <p className="mt-1"><b>Grupos de la cuenta:</b> Usuario General</p>
        </div>
      </div>
    </div>
  );
}
