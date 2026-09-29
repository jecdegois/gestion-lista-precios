"use client";

import { esHallazgoDeNegocio, ResumenValidaciones } from "../Tablas";
import { TIPOS_VARIACION } from "@/lib/catalog";
import { fmtFactor, fmtMonto, fmtPorcentajeCapturado } from "@/lib/format";
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
  {
    key: "mensajeError",
    header: "Mensaje de error",
    value: (fila) => fila.mensajeError
      ? <span className="block max-w-[280px] truncate text-red-700" title={fila.mensajeError}>{fila.mensajeError}</span>
      : <span className="text-zinc-400">—</span>,
  },
  { key: "precioPropuesto", header: "Precio Calc.", align: "right", value: (fila) => <span className="mono">{fmtMonto(fila.validacion.precioPropuesto)}</span> },
  { key: "costoMinimo", header: "Precio Mín.", align: "right", value: (fila) => <span className="mono">{fmtMonto(fila.validacion.costoMinimo)}</span> },
];

interface TablaImpactoDescuentoManualProps {
  filas: FilaPrecio[];
  modo?: "descuento" | "precioBase" | "precioBaseRevision";
  /** Cuando se recibe, oculta la columna "Lista" y muestra este texto descriptivo en su lugar. */
  mensajeListaBase?: string;
  hallazgos?: FilaPrecio[];
  hallazgosHasMore?: boolean;
  hallazgosNextOffset?: number | null;
  hallazgosLoadingMore?: boolean;
  hallazgosCargando?: boolean;
  onLoadMoreHallazgos?: (params: TableLoadParams) => void | Promise<void>;
  hasMore?: boolean;
  nextOffset?: number | null;
  loadingMore?: boolean;
  onLoadMore?: (params: TableLoadParams) => void | Promise<void>;
}

export default function TablaImpactoDescuentoManual({
  filas,
  modo = "descuento",
  mensajeListaBase,
  hallazgos,
  hallazgosHasMore = false,
  hallazgosNextOffset = null,
  hallazgosLoadingMore = false,
  hallazgosCargando = false,
  onLoadMoreHallazgos,
  hasMore = false,
  nextOffset = null,
  loadingMore = false,
  onLoadMore,
}: TablaImpactoDescuentoManualProps) {
  const totalHallazgosVisibles = filas.filter(esHallazgoDeNegocio).length;
  const datosPorCorregir = filas.filter((fila) => !fila.validacion.valido && !esHallazgoDeNegocio(fila)).length;
  const etiquetaVariacion = filas.some((fila) => fila.tipoVariacion === "AUMENTO") ? "Variación %" : "Descuento %";
  const columnas = columns
    .filter((column) => {
      const key = String(column.key);
      if (modo === "precioBaseRevision") {
        return !["lista", "factor", "multiplicador", "factorAplicado", "mensajeError", "precioActual", "precioRedondeado", "costoMinimo"].includes(key);
      }
      // Si hay mensajeListaBase, la columna "lista" se reemplaza por el banner — no se muestra en la tabla.
      if (mensajeListaBase && key === "lista") return false;
      return modo !== "precioBase" || !["lista", "factor", "multiplicador", "factorAplicado", "mensajeError"].includes(key);
    })
    .map((column) => {
      if (modo === "precioBaseRevision" && column.key === "precioPropuesto") return { ...column, header: "Precio Solicitado" };
      return column.key === "factor" ? { ...column, header: etiquetaVariacion } : column;
    });

  return (
    <div>
      {mensajeListaBase && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2 text-xs text-blue-800 mb-3 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
          </svg>
          <span>{mensajeListaBase}</span>
        </div>
      )}
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
        hallazgosCargando={hallazgosCargando}
        onLoadMoreHallazgos={onLoadMoreHallazgos}
      />
    </div>
  );
}
