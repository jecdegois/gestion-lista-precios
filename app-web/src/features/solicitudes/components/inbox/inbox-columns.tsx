import { EstadoBadge } from "@/components/Badges";
import type { TableColumn } from "@/components/newComponents/ResponsiveDataTable";
import { PROCESOS } from "@/lib/catalog";
import type { Solicitud } from "@/lib/domain-types";
import { formatDbDate } from "../../utils/inbox-filters";

/** Columnas de la bandeja; la solicitud propia se marca con "Tu solicitud". */
export function inboxColumns(currentEmail: string): readonly TableColumn<Solicitud>[] {
  return [
    { key: "id", header: "ID", value: (s) => <span className="mono font-medium">{s.id}</span> },
    {
      key: "proceso",
      header: "Proceso",
      value: (s) => <span className="badge badge-outline">{PROCESOS[s.proceso]?.label ?? s.proceso}</span>,
    },
    { key: "lista", header: "Lista de precios", value: (s) => <span className="mono">{s.lista?.trim() || "—"}</span> },
    { key: "compania", header: "Compañía", value: (s) => <span>{s.compania}</span> },
    {
      key: "solicitante",
      header: "Solicitante",
      value: (s) => (
        <span>
          {s.solicitanteNombre}
          {s.solicitanteEmail === currentEmail && <span className="badge badge-outline ml-2">Tu solicitud</span>}
        </span>
      ),
    },
    {
      key: "fecha",
      header: "Fecha",
      value: (s) => <span className="mono text-zinc-500">{formatDbDate(s.fechaCreacion ?? s.fechaEnvio)}</span>,
    },
    { key: "estado", header: "Estado", value: (s) => <EstadoBadge estado={s.estado} /> },
  ];
}
