"use client";

import { useState } from "react";
import ResponsiveDataTable from "@/components/newComponents/ResponsiveDataTable";
import type { Identidad, Solicitud } from "@/lib/domain-types";
import { INBOX_PAGE_SIZE, useInboxRows } from "../../hooks/useInboxRows";
import { ALL, filterInbox, type InboxFilters as Filters } from "../../utils/inbox-filters";
import { inboxColumns } from "./inbox-columns";
import InboxFilters from "./InboxFilters";
import InboxNotice from "./InboxNotice";
import Icon from "@/components/Icon";

/** Listado filtrable de la bandeja con carga incremental; al activar una fila abre su detalle. */
export default function InboxTable({
  requests,
  currentUser,
  onOpen,
  onRefresh,
  refreshing,
}: {
  requests: Solicitud[];
  currentUser: Identidad;
  onOpen: (id: string) => void;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
}) {
  const [filters, setFilters] = useState<Filters>({ status: ALL, process: ALL, search: "" });
  const filtered = filterInbox(requests, currentUser.compania, filters);
  const rows = useInboxRows(requests, filtered, JSON.stringify(filters));
  const searchText = filters.search.trim();

  return (
    <div className="space-y-4">
      <InboxNotice />
      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-outline !px-2.5 !py-1.5 text-xs"
          onClick={() => void onRefresh()}
          disabled={refreshing}
          title="Refrescar solicitudes pendientes"
          aria-label="Refrescar solicitudes pendientes"
        >
          <Icon name="loader" className="h-3.5 w-3.5" spin={refreshing} />
          {refreshing ? "Actualizando..." : "Refrescar"}
        </button>
      </div>
      <InboxFilters filters={filters} onChange={setFilters} />

      <p className="text-xs text-zinc-500">
        Mostrando {rows.displayed.length} de {filtered.length} solicitud(es)
        {searchText ? ` que coinciden con “${searchText}”` : ""}.
        {rows.hasMore ? " Desplácese dentro de la tabla para cargar más." : ""}
      </p>

      <ResponsiveDataTable<Solicitud>
        rows={rows.displayed}
        columns={inboxColumns(currentUser.email)}
        rowKey={(s) => s.id}
        loading={false}
        loadingMore={rows.loadingMore}
        hasMore={rows.hasMore}
        nextOffset={rows.nextOffset}
        onLoadMore={rows.loadMore}
        onRowActivate={(s) => onOpen(s.id)}
        emptyTitle="No hay solicitudes"
        emptyDescription="No hay solicitudes que coincidan con los filtros seleccionados."
      />
      {rows.hasMore && (
        <div className="mt-2 flex justify-center">
          <button
            className="btn btn-outline"
            disabled={rows.loadingMore}
            onClick={() => void rows.loadMore({ offset: rows.nextOffset, limit: INBOX_PAGE_SIZE })}
          >
            {rows.loadingMore ? "Cargando..." : "Cargar más solicitudes"}
          </button>
        </div>
      )}
    </div>
  );
}
