"use client";

import { useEffect, useState } from "react";
import { fmtMonto } from "@/lib/format";
import type { FilaResultado } from "@/lib/domain-types";
import ResponsiveDataTable from "./ResponsiveDataTable";

const PAGE_SIZE = 200;

export default function TablaHallazgosMargen({ filas }: { filas: FilaResultado[] }) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = filas.slice((paginaSegura - 1) * PAGE_SIZE, paginaSegura * PAGE_SIZE);

  useEffect(() => {
    setPagina(1);
  }, [filas]);

  return (
    <ResponsiveDataTable
      rows={visibles}
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
      rowKey={(fila) => `${fila.fila}-${fila.codigo}`}
      meta={{ total: filas.length, page: paginaSegura, limit: PAGE_SIZE, totalPages: totalPaginas }}
      page={paginaSegura}
      limit={PAGE_SIZE}
      pageSizes={[PAGE_SIZE]}
      onPageChange={setPagina}
      emptyTitle="No hay hallazgos de margen"
      emptyDescription="Las filas simuladas cumplen las validaciones de margen."
      redirectOnRowClick={false}
    />
  );
}
