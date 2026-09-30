import Icon from "@/components/Icon";
import type { Identidad } from "@/lib/domain-types";

export default function Vista403({ user }: { user: Identidad }) {
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
