"use client";

import { fmtMonto } from "@/lib/format";
import type { FilaResultado } from "@/lib/domain-types";
import ResponsiveDataTable, { type TableLoadParams } from "./ResponsiveDataTable";

export default function TablaHallazgosMargen({
  filas,
  hasMore = false,
  nextOffset = null,
  loadingMore = false,
  onLoadMore,
}: {
  filas: FilaResultado[];
  hasMore?: boolean;
  nextOffset?: number | null;
  loadingMore?: boolean;
  onLoadMore?: (params: TableLoadParams) => void | Promise<void>;
}) {
  return (
    <ResponsiveDataTable
      rows={filas}
      columns={[
        { key: "codigo", header: "Código", value: (fila) => <span className="mono whitespace-nowrap">{fila.codigo}</span> },
        {
          key: "descripcion",
          header: "Descripción",
          value: (fila) => <span className="block max-w-[280px] truncate whitespace-nowrap" title={fila.descripcion || "—"}>{fila.descripcion || "—"}</span>,
        },
        { key: "causa", header: "Causa", value: (fila) => <span title={fila.validacion.causa ?? "—"}>{fila.validacion.causa ?? "—"}</span> },
        { key: "precioActual", header: "Precio Actual", align: "right", value: (fila) => <span className="mono">{fmtMonto(fila.validacion.precioActual)}</span> },
        { key: "precioMinimo", header: "Precio Mínimo", align: "right", value: (fila) => <span className="mono">{fmtMonto(fila.validacion.costoMinimo)}</span> },
      ]}
      rowKey={(fila) => `${fila.fila}-${fila.codigo}-${"listaCodigo" in fila ? fila.listaCodigo ?? fila.lista ?? "" : ""}`}
      limit={50}
      hasMore={hasMore}
      nextOffset={nextOffset}
      loadingMore={loadingMore}
      onLoadMore={onLoadMore}
      emptyTitle="No hay hallazgos de margen"
      emptyDescription="Las filas simuladas cumplen las validaciones de margen."
      redirectOnRowClick={false}
    />
  );
}
