import type { TableColumn } from "@/components/newComponents/ResponsiveDataTable";
import type { EjecucionLog } from "@/lib/domain-types";
import { EJECUCION_LABELS } from "@/features/ejecucion/routes";
import EstadoEjecucionBadge from "@/features/ejecucion/components/EstadoEjecucionBadge";

/**
 * Convierte un string de fecha (ISO o ya formateado) a "dd/mm HH:mm".
 * Si no puede parsear, devuelve el valor original truncado.
 */
function fechaCorta(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    const dd   = String(d.getDate()).padStart(2, "0");
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const HH   = String(d.getHours()).padStart(2, "0");
    const min  = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${HH}:${min}`;
  }
  // El repositorio ya entrega el string con toLocaleString — intentamos recortar
  // formato típico "dd/mm/yyyy, HH:mm:ss" → "dd/mm HH:mm"
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/\d{4}[,\s]+(\d{2}):(\d{2})/);
  if (m) return `${m[1].padStart(2,"0")}/${m[2].padStart(2,"0")} ${m[3]}:${m[4]}`;
  return raw.slice(0, 11);
}

export const ejecucionAuditColumns: readonly TableColumn<EjecucionLog>[] = [
  {
    key: "tipo",
    header: "Tipo",
    align: "center",
    headerClass: "whitespace-nowrap",
    cellClass: "text-center whitespace-nowrap",
    value: (e) => (
      <span className="badge badge-outline">
        {EJECUCION_LABELS[e.tipo] ?? e.tipo}
      </span>
    ),
  },
  {
    key: "ejecutadoPor",
    header: "Ejecutado por",
    align: "center",
    headerClass: "whitespace-nowrap",
    cellClass: "text-center max-w-[140px]",
    value: (e) => (
      <span title={e.ejecutadoPorEmail} className="block truncate">
        {e.ejecutadoPor}
      </span>
    ),
  },
  {
    key: "fechaInicio",
    header: "Inicio",
    align: "center",
    headerClass: "whitespace-nowrap",
    cellClass: "mono text-zinc-500 whitespace-nowrap text-center min-w-[90px]",
    value: (e) => fechaCorta(e.fechaInicio),
  },
  {
    key: "fechaFin",
    header: "Fin",
    align: "center",
    headerClass: "whitespace-nowrap",
    cellClass: "mono text-zinc-500 whitespace-nowrap text-center min-w-[90px]",
    value: (e) => fechaCorta(e.fechaFin),
  },
  {
    key: "estado",
    header: "Estado",
    align: "center",
    headerClass: "whitespace-nowrap",
    cellClass: "text-center whitespace-nowrap",
    value: (e) => <EstadoEjecucionBadge estado={e.estado} />,
  },
  {
    key: "totalArticulos",
    header: "Total",
    align: "right",
    headerClass: "whitespace-nowrap",
    cellClass: "mono text-right whitespace-nowrap",
    value: (e) => e.totalArticulos,
  },
  {
    key: "exitosos",
    header: "OK",
    align: "right",
    headerClass: "whitespace-nowrap",
    cellClass: "mono text-right text-green-700 font-medium whitespace-nowrap",
    value: (e) => e.exitosos,
  },
  {
    key: "fallidos",
    header: "Error",
    align: "right",
    headerClass: "whitespace-nowrap",
    cellClass: "mono text-right text-red-600 font-medium whitespace-nowrap",
    value: (e) => e.fallidos,
  },
  {
    key: "idProcesoSP",
    header: "ID Proceso SP",
    align: "center",
    headerClass: "whitespace-nowrap",
    cellClass: "mono text-center text-zinc-400 whitespace-nowrap",
    value: (e) => e.idProcesoSP ?? "—",
  },
];
