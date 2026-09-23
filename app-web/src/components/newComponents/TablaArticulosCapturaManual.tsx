"use client";

import Icon from "../Icon";
import ResponsiveDataTable, { type TableColumn } from "./ResponsiveDataTable";
import { calcularVariacion } from "@/lib/preview";
import { fmtFactor } from "@/lib/format";

export interface ArticuloCapturaManualRow {
  fila: number;
  codigo: string;
  listaCodigo: string;
  lista: string;
  variacionPorcentaje: string;
}

interface TablaArticulosCapturaManualProps {
  filas: readonly ArticuloCapturaManualRow[];
  disabled?: boolean;
  onRemove: (codigo: string, listaCodigo: string) => void;
}

export default function TablaArticulosCapturaManual({
  filas,
  disabled = false,
  onRemove,
}: TablaArticulosCapturaManualProps) {
  const columns: readonly TableColumn<ArticuloCapturaManualRow>[] = [
    { key: "fila", header: "#", value: (fila) => fila.fila },
    { key: "codigo", header: "Código", value: (fila) => <span className="mono">{fila.codigo}</span> },
    { key: "lista", header: "Lista", value: (fila) => fila.lista },
    { key: "factor", header: "Descuento %", align: "right", value: (fila) => <span className="mono">{fila.variacionPorcentaje}</span> },
    { key: "multiplicador", header: "Multiplicador", align: "right", value: (fila) => <span className="mono">{fmtFactor(calcularVariacion("DISMINUCION", fila.variacionPorcentaje).factor)}</span> },
    {
      key: "acciones",
      header: "",
      align: "right",
      render: (fila) => (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled}
          aria-label={`Eliminar artículo ${fila.codigo}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(fila.codigo, fila.listaCodigo);
          }}
        >
          <Icon name="trash" className="w-3.5 h-3.5 text-red-500" />
        </button>
      ),
    },
  ];

  return (
    <ResponsiveDataTable
      rows={filas}
      columns={columns}
      rowKey={(fila) => `${fila.codigo}-${fila.listaCodigo}`}
      emptyTitle="No hay artículos agregados"
      emptyDescription="Seleccione un artículo y agréguelo antes de simular."
      redirectOnRowClick={false}
    />
  );
}
