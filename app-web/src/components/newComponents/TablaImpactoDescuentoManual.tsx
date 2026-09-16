"use client";

import { esHallazgoDeNegocio, ResumenValidaciones } from "../Tablas";
import { TIPOS_VARIACION } from "@/lib/catalog";
import { fmtMonto } from "@/lib/format";
import type { FilaPrecio } from "@/lib/domain-types";
import ResponsiveDataTable, { type TableColumn } from "./ResponsiveDataTable";

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
  { key: "factor", header: "Factor", align: "right", value: (fila) => <span className="mono">{fila.valorPropuestoRaw ?? "—"}</span> },
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

export default function TablaImpactoDescuentoManual({ filas }: { filas: FilaPrecio[] }) {
  const hallazgos = filas.filter(esHallazgoDeNegocio).length;
  const datosPorCorregir = filas.filter((fila) => !fila.validacion.valido && !esHallazgoDeNegocio(fila)).length;

  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        {filas.length} fila(s) evaluada(s)
        {hallazgos > 0 ? ` · ${hallazgos} con hallazgo` : ""}
        {datosPorCorregir > 0 ? ` · ${datosPorCorregir} dato(s) por corregir` : ""}
      </p>
      <ResponsiveDataTable
        rows={filas}
        columns={columns}
        rowKey={(fila) => `${fila.fila}-${fila.codigo}-${fila.listaCodigo ?? ""}`}
        emptyTitle="No hay filas de simulación"
        emptyDescription="Agregue artículos y ejecute la simulación para ver el impacto."
        redirectOnRowClick={false}
        rowClassName={(fila) => fila.validacion.valido ? "bg-green-50" : ""}
      />
      <ResumenValidaciones filas={filas} />
    </div>
  );
}
