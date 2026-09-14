"use client";

import { EstadoBadge } from "./Badges";
import { PROCESOS } from "@/lib/catalog";
import type { Identidad, Solicitud } from "@/lib/domain-types";

export default function MisSolicitudes({
  solicitudes,
  currentUser,
  onVerDetalle,
}: {
  solicitudes: Solicitud[];
  currentUser: Identidad;
  onVerDetalle: (id: string) => void;
}) {
  const propias = solicitudes.filter((s) => s.solicitanteEmail === currentUser.email);
  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold mb-3">Mis solicitudes enviadas</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="text-left font-medium px-4 py-3">ID</th>
              <th className="text-left font-medium px-4 py-3">Proceso</th>
              <th className="text-left font-medium px-4 py-3">Compañía</th>
              <th className="text-left font-medium px-4 py-3">Fecha</th>
              <th className="text-left font-medium px-4 py-3">Estado</th>
              <th className="text-left font-medium px-4 py-3">Detalle</th>
              <th className="text-left font-medium px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {propias.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-400">Aún no ha enviado solicitudes en esta sesión.</td></tr>
            )}
            {propias.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 mono">{s.id}</td>
                <td className="px-4 py-3"><span className="badge badge-outline">{PROCESOS[s.proceso]?.label || s.proceso || "MASIVO"}</span></td>
                <td className="px-4 py-3">{s.compania}</td>
                <td className="px-4 py-3 mono text-zinc-500">{s.fechaEnvio}</td>
                <td className="px-4 py-3"><EstadoBadge estado={s.estado} /></td>
                <td className="px-4 py-3 text-xs text-zinc-500">
                  {s.estado === "RECHAZADO" ? s.motivoRechazo : s.estado === "EN_PROCESO" ? `Trabajo en segundo plano (${s.idProcesoSP})` : s.idProcesoSP || "—"}
                </td>
                <td className="px-4 py-3">
                  <button className="btn btn-outline" onClick={() => onVerDetalle(s.id)}>
                    {s.estado === "EN_PROCESO" ? "Consultar avance" : "Ver detalle"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
