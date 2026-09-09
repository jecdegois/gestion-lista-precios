"use client";

import { etiquetaEvento } from "@/lib/events";
import type { EventoAuditoria } from "@/lib/domain-types";

export default function Auditoria({ eventos }: { eventos: EventoAuditoria[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-xs text-zinc-500">
          <tr>
            <th className="text-left font-medium px-4 py-3">Fecha/Hora</th>
            <th className="text-left font-medium px-4 py-3">Usuario</th>
            <th className="text-left font-medium px-4 py-3">Rol</th>
            <th className="text-left font-medium px-4 py-3">Evento</th>
            <th className="text-left font-medium px-4 py-3">ID Solicitud</th>
            <th className="text-left font-medium px-4 py-3">ID de Proceso</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {eventos.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-400">Sin eventos registrados en esta sesión todavía.</td></tr>
          )}
          {eventos.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 mono text-zinc-500">{e.fecha}</td>
              <td className="px-4 py-3">{e.usuario}</td>
              <td className="px-4 py-3"><span className="badge badge-outline">{e.rol}</span></td>
              <td className="px-4 py-3"><span className="badge badge-outline">{etiquetaEvento(e.evento)}</span></td>
              <td className="px-4 py-3 mono">{e.solicitudId || "—"}</td>
              <td className="px-4 py-3 mono">{e.idProcesoSP || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
