"use client";

import { esHallazgoDeNegocio, ResumenValidaciones } from "../Tablas";
import { TIPOS_VARIACION } from "@/lib/catalog";
import { fmtFactor, fmtMonto, fmtPorcentajeCapturado, fmtPorcentajeMultiplicador } from "@/lib/format";
import type { FilaPrecio } from "@/lib/domain-types";
import ResponsiveDataTable, { type TableColumn, type TableLoadParams } from "./ResponsiveDataTable";

const columns: readonly TableColumn<FilaPrecio>[] = [
  { key: "codigo", header: "Código", value: (fila) => <span className="mono whitespace-nowrap">{fila.codigo}</span> },
  { key: "lista", header: "Lista", value: (fila) => fila.lista ?? "—" },
  { key: "descripcion", header: "Descripción", value: (fila) => <span className="block max-w-[280px] truncate whitespace-nowrap" title={fila.descripcion || "—"}>{fila.descripcion || "—"}</span> },
  { key: "precioActual", header: "Precio Actual", align: "right", value: (fila) => <span className="mono">{fmtMonto(fila.validacion.precioActual)}</span> },
  /*{
    key: "tipoVariacion",
    header: "Tipo Var.",
    value: (fila) => {
      const tipo = fila.tipoVariacion ? TIPOS_VARIACION[fila.tipoVariacion] : "—";
      return <span className={`badge ${fila.tipoVariacion === "DISMINUCION" ? "badge-rechazado" : "badge-ok"}`}>{tipo}</span>;
    },
  },*/
  { key: "factor", header: "Descuento %", align: "right", value: (fila) => <span className="mono">{fmtPorcentajeCapturado(fila.variacionPorcentaje)}</span> },
  { key: "multiplicador", header: "Multiplicador", align: "right", value: (fila) => <span className="mono">{fmtFactor(fila.multiplicador ?? fila.factorPropuesto)}</span> },
  { key: "factorAplicado", header: "Descuento Aplicado %", align: "right", value: (fila) => <span className="mono">{fmtPorcentajeMultiplicador(fila.factorAplicado)}</span> },
  {
    key: "mensajeError",
    header: "Mensaje de error",
    value: (fila) => fila.mensajeError
      ? <span className="block max-w-[280px] truncate text-red-700" title={fila.mensajeError}>{fila.mensajeError}</span>
      : <span className="text-zinc-400">—</span>,
  },
  { key: "precioPropuesto", header: "Precio Calc.", align: "right", value: (fila) => <span className="mono">{fmtMonto(fila.validacion.precioPropuesto)}</span> },
  {
    key: "precioRedondeado",
    header: "Precio Red.",
    align: "right",
    value: (fila) => fila.validacion.precioRedondeado != null
      ? <b className="mono">{fmtMonto(fila.validacion.precioRedondeado)}</b>
      : <span className="text-zinc-400">—</span>,
  },
  { key: "costoMinimo", header: "Precio Mín.", align: "right", value: (fila) => <span className="mono">{fmtMonto(fila.validacion.costoMinimo)}</span> },
];

interface TablaImpactoDescuentoManualProps {
  filas: FilaPrecio[];
  hallazgos?: FilaPrecio[];
  hallazgosHasMore?: boolean;
  hallazgosNextOffset?: number | null;
  hallazgosLoadingMore?: boolean;
  onLoadMoreHallazgos?: (params: TableLoadParams) => void | Promise<void>;
  hasMore?: boolean;
  nextOffset?: number | null;
  loadingMore?: boolean;
  onLoadMore?: (params: TableLoadParams) => void | Promise<void>;
}

export default function TablaImpactoDescuentoManual({
  filas,
  hallazgos,
  hallazgosHasMore = false,
  hallazgosNextOffset = null,
  hallazgosLoadingMore = false,
  onLoadMoreHallazgos,
  hasMore = false,
  nextOffset = null,
  loadingMore = false,
  onLoadMore,
}: TablaImpactoDescuentoManualProps) {
  const totalHallazgosVisibles = filas.filter(esHallazgoDeNegocio).length;
  const datosPorCorregir = filas.filter((fila) => !fila.validacion.valido && !esHallazgoDeNegocio(fila)).length;
  const etiquetaVariacion = filas.some((fila) => fila.tipoVariacion === "AUMENTO") ? "Variación %" : "Descuento %";
  const columnas = columns.map((column) => column.key === "factor" ? { ...column, header: etiquetaVariacion } : column);

  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        {filas.length} fila(s) evaluada(s)
        {totalHallazgosVisibles > 0 ? ` · ${totalHallazgosVisibles} con hallazgo` : ""}
        {datosPorCorregir > 0 ? ` · ${datosPorCorregir} dato(s) por corregir` : ""}
      </p>
      <ResponsiveDataTable
        rows={filas}
        columns={columnas}
        rowKey={(fila) => `${fila.fila}-${fila.codigo}-${fila.listaCodigo ?? ""}`}
        emptyTitle="No hay filas de simulación"
        emptyDescription="Agregue artículos y ejecute la simulación para ver el impacto."
        redirectOnRowClick={false}
        limit={200}
        hasMore={hasMore}
        nextOffset={nextOffset}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        rowClassName={(fila) => fila.validacion.valido ? "bg-green-50" : "bg-red-50"}
      />
      <ResumenValidaciones
        filas={filas}
        hallazgosExternos={hallazgos}
        hallazgosHasMore={hallazgosHasMore}
        hallazgosNextOffset={hallazgosNextOffset}
        hallazgosLoadingMore={hallazgosLoadingMore}
        onLoadMoreHallazgos={onLoadMoreHallazgos}
      />
    </div>
  );
}
