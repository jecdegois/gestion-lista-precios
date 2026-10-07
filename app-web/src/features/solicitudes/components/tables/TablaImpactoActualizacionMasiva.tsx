"use client";

import type { FilaPrecio, FilaResultado } from "@/shared/types/domain-types";
import TablaImpactoDescuentoManual from "@/features/solicitudes/components/tables/TablaImpactoDescuentoManual";
import type { TableLoadParams } from "@/shared/components/ui/ResponsiveDataTable";

export default function TablaImpactoActualizacionMasiva({
  filas,
  soloPrecioSolicitado = false,
  mostrarErrores = false,
  ocultarDatosPorCorregir,
  hasMore = false,
  nextOffset = null,
  loadingMore = false,
  onLoadMore,
  // Props de hallazgos paginados
  hallazgos,
  hallazgosHasMore = false,
  hallazgosNextOffset = null,
  hallazgosLoadingMore = false,
  hallazgosCargando = false,
  onLoadMoreHallazgos,
}: {
  filas: FilaPrecio[];
  soloPrecioSolicitado?: boolean;
  /** Cuando true (hay filas inválidas en modal de revisión), usa modo completo para mostrar causa de error. */
  mostrarErrores?: boolean;
  ocultarDatosPorCorregir?: boolean;
  hasMore?: boolean;
  nextOffset?: number | null;
  loadingMore?: boolean;
  onLoadMore?: (params: TableLoadParams) => void | Promise<void>;
  // Props de hallazgos paginados
  hallazgos?: FilaResultado[];
  hallazgosHasMore?: boolean;
  hallazgosNextOffset?: number | null;
  hallazgosLoadingMore?: boolean;
  hallazgosCargando?: boolean;
  onLoadMoreHallazgos?: (params: TableLoadParams) => void | Promise<void>;
}) {
  const modo = mostrarErrores ? "precioBase" : soloPrecioSolicitado ? "precioBaseRevision" : "precioBase";
  return (
    <TablaImpactoDescuentoManual
      filas={filas}
      modo={modo}
      ocultarDatosPorCorregir={ocultarDatosPorCorregir}
      hasMore={hasMore}
      nextOffset={nextOffset}
      loadingMore={loadingMore}
      onLoadMore={onLoadMore}
      hallazgos={hallazgos as FilaPrecio[] | undefined}
      hallazgosHasMore={hallazgosHasMore}
      hallazgosNextOffset={hallazgosNextOffset}
      hallazgosLoadingMore={hallazgosLoadingMore}
      hallazgosCargando={hallazgosCargando}
      onLoadMoreHallazgos={onLoadMoreHallazgos}
    />
  );
}
