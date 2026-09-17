"use client";

import { esHallazgoDeNegocio, ResumenValidaciones } from "../Tablas";
import { fmtFactor, fmtMonto, fmtPct } from "@/lib/format";
import type { FilaMargen } from "@/lib/domain-types";
import ResponsiveDataTable, { type TableColumn, type TableLoadParams } from "./ResponsiveDataTable";

const columns: readonly TableColumn<FilaMargen>[] = [
  { key: "codigo", header: "Código", value: (fila) => <span className="mono whitespace-nowrap">{fila.codigo}</span> },
  { key: "descripcion", header: "Descripción", value: (fila) => <span className="block max-w-[280px] truncate whitespace-nowrap" title={fila.descripcion || "—"}>{fila.descripcion || "—"}</span> },
  { key: "porcentaje", header: "% Reducción", align: "right", value: (fila) => <span className="mono">{fila.validacion.porcentajeReduccion != null ? `${fila.validacion.porcentajeReduccion.toFixed(2)}%` : "—"}</span> },
  { key: "factor", header: "Factor norm.", align: "right", value: (fila) => <span className="mono">{fmtFactor(fila.validacion.factorReduccion)}</span> },
  { key: "multiplicador", header: "Multiplicador", align: "right", value: (fila) => <span className="mono">{fmtFactor(fila.validacion.multiplicadorMargen)}</span> },
  { key: "precioActual", header: "Precio Lista", align: "right", value: (fila) => <span className="mono">{fmtMonto(fila.validacion.precioActual)}</span> },
  {
    key: "precioRedondeado",
    header: "Precio Redondeado",
    align: "right",
    value: (fila) => fila.validacion.precioRedondeado != null
      ? <b className="mono">{fmtMonto(fila.validacion.precioRedondeado)}</b>
      : <span className="text-zinc-400">—</span>,
  },
  { key: "margen", header: "Margen Promedio", align: "right", value: (fila) => <span className="mono">{fmtPct(fila.validacion.margenPromedio)}</span> },
  { key: "costoMinimoBase", header: "Precio Mín. Base", align: "right", value: (fila) => <span className="mono">{fmtMonto(fila.validacion.costoMinimoBase)}</span> },
  {
    key: "costoMinimo",
    header: "Precio Mín. Sim.",
    align: "right",
    value: (fila) => fila.validacion.costoMinimo != null
      ? <b className="mono">{fmtMonto(fila.validacion.costoMinimo)}</b>
      : <span className="text-zinc-400">—</span>,
  },
];

interface TablaImpactoMargenProps {
  filas: FilaMargen[];
  hasMore?: boolean;
  nextOffset?: number | null;
  loadingMore?: boolean;
  onLoadMore?: (params: TableLoadParams) => void | Promise<void>;
}

export default function TablaImpactoMargen({
  filas,
  hasMore = false,
  nextOffset = null,
  loadingMore = false,
  onLoadMore,
}: TablaImpactoMargenProps) {
  const hallazgos = filas.filter(esHallazgoDeNegocio).length;
  const datosPorCorregir = filas.filter((fila) => !fila.validacion.valido && !esHallazgoDeNegocio(fila)).length;

  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        {filas.length} artículo(s) evaluado(s)
        {hallazgos > 0 ? ` · ${hallazgos} con hallazgo` : ""}
        {datosPorCorregir > 0 ? ` · ${datosPorCorregir} dato(s) por corregir` : ""}
        {hallazgos === 0 && datosPorCorregir === 0 ? " · cálculo y redondeo comercial verificados" : ""}
      </p>
      <ResponsiveDataTable
        rows={filas}
        columns={columns}
        rowKey={(fila) => `${fila.fila}-${fila.codigo}`}
        emptyTitle="No hay filas de simulación"
        emptyDescription="Cargue un archivo Excel y ejecute la simulación para ver el impacto."
        redirectOnRowClick={false}
        limit={200}
        hasMore={hasMore}
        nextOffset={nextOffset}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        rowClassName={(fila) => fila.validacion.valido ? "bg-green-50" : "bg-red-50"}
      />
      <ResumenValidaciones filas={filas} />
    </div>
  );
}
