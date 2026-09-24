import { etiquetaEvento } from "@/lib/events";
import type { EventoAuditoria } from "@/lib/domain-types";

export default function AuditRow({ event }: { event: EventoAuditoria }) {
  return (
    <tr>
      <td className="px-4 py-3 mono text-zinc-500">{event.fecha}</td>
      <td className="px-4 py-3">{event.usuario}</td>
      <td className="px-4 py-3"><span className="badge badge-outline">{event.rol}</span></td>
      <td className="px-4 py-3"><span className="badge badge-outline">{etiquetaEvento(event.evento)}</span></td>
      <td className="px-4 py-3 mono">{event.solicitudId || "—"}</td>
      <td className="px-4 py-3 mono">{event.idProcesoSP || "—"}</td>
    </tr>
  );
}
