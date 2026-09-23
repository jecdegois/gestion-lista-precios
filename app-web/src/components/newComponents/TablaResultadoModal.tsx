"use client";

import { useEffect, useState } from "react";
import { esHallazgoDeNegocio, ResumenValidaciones } from "../Tablas";
import { TIPOS_VARIACION } from "@/lib/catalog";
import { esFilaMargen, type FilaResultado } from "@/lib/domain-types";
import { fmtFactor, fmtMonto, fmtPct, fmtPorcentajeCapturado, fmtPorcentajeMultiplicador } from "@/lib/format";
import ResponsiveDataTable, { type TableColumn } from "./ResponsiveDataTable";

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
    key: "precioActual",
    header: "Precio Actual",
    align: "right",
    value: (fila) => <span className="mono">{fmtMonto(fila.validacion.precioActual)}</span>,
  },
  {
    key: "precioCalculado",
    header: "Precio Calc.",
    align: "right",
    value: (fila) => <span className="mono">{fmtMonto(fila.validacion.precioPropuesto)}</span>,
  },
  {
    key: "precioRedondeado",
    header: "Precio Redondeado",
    align: "right",
    value: (fila) => fila.validacion.precioRedondeado != null
      ? <b className="mono">{fmtMonto(fila.validacion.precioRedondeado)}</b>
      : <span className="text-zinc-400">—</span>,
  },
  {
    key: "precioMinimo",
    header: "Precio Mínimo",
    align: "right",
    value: (fila) => <span className="mono">{fmtMonto(fila.validacion.precioMin)}</span>,
  },
  {
    key: "margen",
    header: "Margen Promedio",
    align: "right",
    value: (fila) => <span className="mono">{esFilaMargen(fila) ? fmtPct(fila.validacion.margenPromedio) : "—"}</span>,
  },
];

export default function TablaResultadoModal({ filas }: { filas: FilaResultado[] }) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = filas.slice((paginaSegura - 1) * PAGE_SIZE, paginaSegura * PAGE_SIZE);
  const hallazgos = filas.filter(esHallazgoDeNegocio).length;
  const invalidas = filas.filter((fila) => !fila.validacion.valido).length;

  useEffect(() => {
    setPagina(1);
  }, [filas]);

  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        {filas.length} fila(s) evaluada(s)
        {hallazgos > 0 ? ` · ${hallazgos} con hallazgo` : ""}
        {invalidas > 0 ? ` · ${invalidas} inválida(s)` : ""}
        {totalPaginas > 1 ? ` · Página ${paginaSegura} de ${totalPaginas}` : ""}
      </p>
      <ResponsiveDataTable
        rows={visibles}
        columns={columns}
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
      />
      <ResumenValidaciones filas={filas} />
    </div>
  );
}
