"use client";

import { useEffect, useState } from "react";
import { esHallazgoDeNegocio, ResumenValidaciones } from "@/features/solicitudes/components/tables/Tablas";
import { TIPOS_VARIACION } from "@/features/solicitudes/utils/catalog";
import { esFilaMargen, type FilaResultado } from "@/shared/types/domain-types";
import { fmtFactor, fmtPct, fmtPorcentajeCapturado, fmtPorcentajeMultiplicador } from "@/shared/utils/format";
import ResponsiveDataTable, { type TableColumn, type TableLoadParams } from "@/shared/components/ui/ResponsiveDataTable";
import { Monto } from "@/shared/components/layout/PortalProviders";

const PAGE_SIZE = 200;

const columns: readonly TableColumn<FilaResultado>[] = [
  { key: "codigo", header: "Código", value: (fila) => <span className="mono whitespace-nowrap">{fila.codigo}</span> },
  {
    key: "lista",
    header: "Lista",
    value: (fila) => !esFilaMargen(fila) ? fila.lista ?? "—" : "—",
  },
  {
    key: "descripcion",
    header: "Descripción",
    value: (fila) => <span className="block max-w-[280px] truncate whitespace-nowrap" title={fila.descripcion || "—"}>{fila.descripcion || "—"}</span>,
  },
  {
    key: "variacion",
    header: "Variación",
    value: (fila) => esFilaMargen(fila)
      ? `${fila.validacion.porcentajeReduccion?.toFixed(2) ?? "—"}%`
      : <span className={`badge ${fila.tipoVariacion === "DISMINUCION" ? "badge-rechazado" : "badge-ok"}`}>{fila.tipoVariacion ? TIPOS_VARIACION[fila.tipoVariacion] : "—"}</span>,
  },
  {
    key: "factor",
    header: "Descuento %",
    align: "right",
    value: (fila) => <span className="mono">{esFilaMargen(fila) ? fmtFactor(fila.validacion.factorPropuesto) : fmtPorcentajeCapturado(fila.variacionPorcentaje)}</span>,
  },
  {
    key: "factorAplicado",
    header: "Descuento Aplicado %",
    align: "right",
    value: (fila) => <span className="mono">{fmtPorcentajeMultiplicador(fila.factorAplicado)}</span>,
  },
  {
    key: "mensajeError",
    header: "Mensaje de error",
    value: (fila) => fila.mensajeError
      ? <span className="block max-w-[280px] truncate text-red-700" title={fila.mensajeError}>{fila.mensajeError}</span>
      : <span className="text-zinc-400">—</span>,
  },
  {
    key: "multiplicador",
    header: "Multiplicador",
    align: "right",
    value: (fila) => <span className="mono">{fmtFactor(esFilaMargen(fila) ? fila.validacion.multiplicador : fila.multiplicador ?? fila.factorPropuesto)}</span>,
  },
  {
    key: "precioBase",
    header: "Precio Base",
    align: "right",
    value: (fila) => <span className="mono"><Monto n={fila.validacion.precioActual} /></span>,
  },
  {
    key: "precioActual",
    header: "Precio Actual",
    align: "right",
    value: (fila) => <span className="mono"><Monto n={esFilaMargen(fila) ? fila.validacion.precioActual : fila.validacion.precioVigente ?? fila.validacion.precioActual} /></span>,
  },
  {
    key: "precioCalculado",
    header: "Precio Calculado",
    align: "right",
    value: (fila) => <span className="mono"><Monto n={fila.validacion.precioPropuesto} /></span>,
  },
  {
    key: "precioMinimo",
    header: "Precio Mínimo",
    align: "right",
    value: (fila) => <span className="mono"><Monto n={fila.validacion.precioMin} /></span>,
  },
  {
    key: "margen",
    header: "Margen Promedio",
    align: "right",
    value: (fila) => <span className="mono">{esFilaMargen(fila) ? fmtPct(fila.validacion.margenPromedio) : "—"}</span>,
  },
];

interface TablaResultadoModalProps {
  filas: FilaResultado[];
  modo?: "general" | "descuentoArticuloLista";
  /** Indica si hay más filas por cargar desde el servidor. */
  hasMore?: boolean;
  /** Offset de la siguiente página (paginación server-side). */
  nextOffset?: number | null;
  /** Indica si está cargando más filas. */
  loadingMore?: boolean;
  /** Callback para cargar más filas (paginación server-side). */
  onLoadMore?: (params?: TableLoadParams) => void | Promise<void>;
  // Props de hallazgos paginados
  hallazgos?: FilaResultado[];
  hallazgosTotal?: number;
  hallazgosHasMore?: boolean;
  hallazgosNextOffset?: number | null;
  hallazgosLoadingMore?: boolean;
  hallazgosCargando?: boolean;
  onLoadMoreHallazgos?: (params: TableLoadParams) => void | Promise<void>;
}

export default function TablaResultadoModal({
  filas,
  modo = "general",
  hasMore = false,
  nextOffset = null,
  loadingMore = false,
  onLoadMore,
  // Props de hallazgos paginados
  hallazgos: hallazgosExternos,
  hallazgosTotal,
  hallazgosHasMore = false,
  hallazgosNextOffset = null,
  hallazgosLoadingMore = false,
  hallazgosCargando = false,
  onLoadMoreHallazgos,
}: TablaResultadoModalProps) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = filas.slice((paginaSegura - 1) * PAGE_SIZE, paginaSegura * PAGE_SIZE);
  // Usar total del backend si está disponible, sino contar de filas cargadas
  const totalHallazgos = hallazgosTotal ?? (hallazgosExternos?.length ?? filas.filter(esHallazgoDeNegocio).length);
  const hallazgos = hallazgosExternos?.length ?? filas.filter(esHallazgoDeNegocio).length;
  const invalidas = filas.filter((fila) => !fila.validacion.valido).length;
  const esDetalleMargen = filas.length > 0 && filas.every(esFilaMargen);
  const columnasVisibles = esDetalleMargen
    ? columns.filter((column) => !["lista", "factor", "factorAplicado", "multiplicador"].includes(String(column.key)))
    : modo === "descuentoArticuloLista"
      ? columns.filter((column) => !["variacion", "factorAplicado", "mensajeError", "margen"].includes(String(column.key)))
      : columns;
  const columnasFormateadas = columnasVisibles.map((column) => {
    if (modo === "descuentoArticuloLista" && column.key === "variacion") {
      return {
        ...column,
        header: "Variación %",
        value: (fila: FilaResultado) => fmtPorcentajeCapturado(!esFilaMargen(fila) ? fila.variacionPorcentaje : null),
      };
    }
    return column;
  });

  useEffect(() => {
    setPagina(1);
  }, [filas]);

  // Wrapper para convertir el callback de paginación server-side al formato esperado
  const handleLoadMore = onLoadMore
    ? (params: TableLoadParams) => onLoadMore(params)
    : undefined;

  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        {filas.length} fila(s) evaluada(s)
        {totalHallazgos > 0 ? ` · ${totalHallazgos} con hallazgo` : ""}
        {invalidas > 0 ? ` · ${invalidas} inválida(s)` : ""}
        {totalPaginas > 1 ? ` · Página ${paginaSegura} de ${totalPaginas}` : ""}
        {hasMore ? " · (cargando más…)" : ""}
      </p>
      <ResponsiveDataTable
        rows={visibles}
        columns={columnasFormateadas}
        rowKey={(fila) => `${fila.fila}-${fila.codigo}-${!esFilaMargen(fila) ? fila.listaCodigo ?? "" : "margen"}`}
        meta={{ total: filas.length, page: paginaSegura, limit: PAGE_SIZE, totalPages: totalPaginas }}
        page={paginaSegura}
        limit={PAGE_SIZE}
        pageSizes={[PAGE_SIZE]}
        onPageChange={setPagina}
        rowClassName={(fila) => fila.validacion.valido ? "bg-green-50" : "bg-red-50"}
        emptyTitle="No hay detalle de solicitud"
        emptyDescription="Esta solicitud no conserva filas de impacto."
        redirectOnRowClick={false}
        hasMore={hasMore}
        nextOffset={nextOffset}
        loadingMore={loadingMore}
        onLoadMore={handleLoadMore}
      />
      <ResumenValidaciones
        filas={filas}
        hallazgosExternos={hallazgosExternos}
        hallazgosHasMore={hallazgosHasMore}
        hallazgosNextOffset={hallazgosNextOffset}
        hallazgosLoadingMore={hallazgosLoadingMore}
        hallazgosCargando={hallazgosCargando}
        onLoadMoreHallazgos={onLoadMoreHallazgos}
      />
    </div>
  );
}
