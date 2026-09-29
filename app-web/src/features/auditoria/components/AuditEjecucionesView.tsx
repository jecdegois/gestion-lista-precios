"use client";

import ResponsiveDataTable from "@/components/newComponents/ResponsiveDataTable";
import type { EjecucionLog } from "@/lib/domain-types";
import { useAuditEjecuciones } from "../hooks/useAuditEjecuciones";
import { ejecucionAuditColumns } from "./table/ejecucion-audit-columns";
import AuditEjecucionFilters from "./AuditEjecucionFilters";
import { AUDIT_EXEC_PAGE_SIZE } from "../api/ejecuciones-audit-api";

export default function AuditEjecucionesView() {
  const {
    ejecuciones,
    total,
    hasMore,
    nextOffset,
    refreshing,
    loadingMore,
    filters,
    applyFilters,
    loadMore,
  } = useAuditEjecuciones();

  return (
    <div className="space-y-4">
      <AuditEjecucionFilters filters={filters} onChange={applyFilters} />

      <p className="text-xs text-zinc-500">
        Mostrando {ejecuciones.length} de {total} ejecución(es).
        {hasMore ? " Hay más registros — desplácese o use el botón para cargar." : ""}
      </p>

      <ResponsiveDataTable<EjecucionLog>
        rows={ejecuciones}
        columns={ejecucionAuditColumns}
        rowKey={(e) => e.id}
        loading={refreshing && ejecuciones.length === 0}
        loadingMore={loadingMore}
        hasMore={hasMore}
        nextOffset={nextOffset}
        onLoadMore={() => void loadMore()}
        emptyTitle="Sin ejecuciones registradas"
        emptyDescription="No hay ejecuciones que coincidan con los filtros seleccionados."
        rowClassName={(e) =>
          e.estado === "ERROR" || e.estado === "COMPLETADO_CON_ERRORES" ? "row-alert" : ""
        }
      />

      {hasMore && (
        <div className="mt-2 flex justify-center">
          <button
            className="btn btn-outline"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Cargando..." : `Cargar más (${AUDIT_EXEC_PAGE_SIZE} por página)`}
          </button>
        </div>
      )}
    </div>
  );
}
