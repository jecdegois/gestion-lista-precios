import type { EventoAuditoria } from "@/lib/domain-types";
import AuditRow from "./AuditRow";

const COLUMNS = ["Fecha/Hora", "Usuario", "Rol", "Evento", "ID Solicitud", "ID de Proceso"];

export default function AuditTable({ events }: { events: EventoAuditoria[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-xs text-zinc-500">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} className="text-left font-medium px-4 py-3">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {events.length === 0 && (
            <tr><td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-zinc-400">Sin eventos registrados en esta sesión todavía.</td></tr>
          )}
          {events.map((event) => <AuditRow key={event.id} event={event} />)}
        </tbody>
      </table>
    </div>
  );
}
