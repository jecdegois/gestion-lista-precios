"use client";

import { useState } from "react";
import ResponsiveDataTable from "@/components/newComponents/ResponsiveDataTable";
import type { Identidad, Solicitud } from "@/lib/domain-types";
import { INBOX_PAGE_SIZE } from "../../hooks/useInbox";
import { ALL, type InboxFilters as Filters } from "../../utils/inbox-filters";
import { useInboxRows } from "../../hooks/useInboxRows";
import { inboxColumns } from "./inbox-columns";
import InboxFilters from "./InboxFilters";
import InboxNotice from "./InboxNotice";
import Icon from "@/components/Icon";

/** Listado filtrable de la bandeja con carga incremental server-side. */
export default function InboxTable({
  requests,
  total,
  hasMore,
  loadingMore,
  currentUser,
  onOpen,
  onRefresh,
  onLoadMore,
  refreshing,
}: {
  requests: Solicitud[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  currentUser: Identidad;
  onOpen: (id: string) => void;
  onRefresh: () => Promise<void>;
  onLoadMore: () => Promise<void>;
  refreshing: boolean;
}) {
  const [filters, setFilters] = useState<Filters>({ status: ALL, process: ALL, search: "" });
  const filtered = useInboxRows(requests, currentUser.compania, filters);
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
        Mostrando {filtered.length} de {total} solicitud(es)
        {searchText ? ` que coinciden con "${searchText}"` : ""}.
        {hasMore ? " Hay más solicitudes — desplácese o use el botón para cargar." : ""}
      </p>

      <ResponsiveDataTable<Solicitud>
        rows={filtered}
        columns={inboxColumns(currentUser.email)}
        rowKey={(s) => s.id}
        loading={refreshing && requests.length === 0}
        loadingMore={loadingMore}
        hasMore={hasMore}
        nextOffset={requests.length}
        onLoadMore={() => void onLoadMore()}
        onRowActivate={(s) => onOpen(s.id)}
        emptyTitle="No hay solicitudes"
        emptyDescription="No hay solicitudes que coincidan con los filtros seleccionados."
      />

      {hasMore && (
        <div className="mt-2 flex justify-center">
          <button
            className="btn btn-outline"
            disabled={loadingMore}
            onClick={() => void onLoadMore()}
          >
            {loadingMore ? "Cargando..." : `Cargar más (${INBOX_PAGE_SIZE} por página)`}
          </button>
        </div>
      )}
    </div>
  );
}
