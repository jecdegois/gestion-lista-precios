import type { TableColumn } from "@/shared/components/ui/ResponsiveDataTable";
import type { EjecucionLog } from "@/shared/types/domain-types";
import { EJECUCION_LABELS } from "../../routes";
import EstadoEjecucionBadge from "../EstadoEjecucionBadge";
import { fmtFechaBd } from "@/shared/utils/format";

/** Fecha de SQL Server (ISO) a "dd/mm, HH:mm". */
function fechaCorta(raw: string | null): string {
  return fmtFechaBd(raw, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export const ejecucionColumns: readonly TableColumn<EjecucionLog>[] = [
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

/** Resalta las ejecuciones que terminaron con errores. */
export function ejecucionRowClass(e: EjecucionLog): string {
  return e.estado === "ERROR" || e.estado === "COMPLETADO_CON_ERRORES" ? "row-alert" : "";
}
