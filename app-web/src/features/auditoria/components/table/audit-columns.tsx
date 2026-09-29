import type { TableColumn } from "@/components/newComponents/ResponsiveDataTable";
import type { EventoAuditoria } from "@/lib/domain-types";
import { etiquetaEvento } from "@/lib/events";

export const auditColumns: readonly TableColumn<EventoAuditoria>[] = [
  {
    key: "fecha",
    header: "Fecha/Hora",
    align: "center",
    headerClass: "whitespace-nowrap",
    cellClass: "mono text-zinc-500 whitespace-nowrap text-center",
    value: (e) => e.fecha,
  },
  {
    key: "usuario",
    header: "Usuario",
    align: "center",
    headerClass: "whitespace-nowrap",
    cellClass: "text-center max-w-[160px]",
    value: (e) => (
      <span className="block truncate" title={e.usuario}>
        {e.usuario || "—"}
      </span>
    ),
  },
  {
    key: "rol",
    header: "Rol",
    align: "center",
    headerClass: "whitespace-nowrap",
    cellClass: "text-center whitespace-nowrap",
    value: (e) => <span className="badge badge-outline">{e.rol}</span>,
  },
  {
    key: "evento",
    header: "Evento",
    align: "center",
    headerClass: "whitespace-nowrap",
    cellClass: "text-center",
    value: (e) => (
      <span className="badge badge-outline block max-w-[220px] truncate" title={etiquetaEvento(e.evento)}>
        {etiquetaEvento(e.evento)}
      </span>
    ),
  },
  {
    key: "solicitudId",
    header: "ID Solicitud",
    align: "center",
    headerClass: "whitespace-nowrap",
    cellClass: "mono text-center whitespace-nowrap",
    value: (e) => e.solicitudId || "—",
  },
  {
    key: "idProcesoSP",
    header: "ID Proceso",
    align: "center",
    headerClass: "whitespace-nowrap",
    cellClass: "mono text-center whitespace-nowrap",
    value: (e) => e.idProcesoSP || "—",
  },
];
