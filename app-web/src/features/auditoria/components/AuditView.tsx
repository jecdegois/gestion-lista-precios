"use client";

import { useState } from "react";
import ResponsiveDataTable from "@/components/newComponents/ResponsiveDataTable";
import type { EventoAuditoria } from "@/lib/domain-types";
import { useAudit } from "../hooks/useAudit";
import { auditColumns } from "./table/audit-columns";
import AuditFilters from "./AuditFilters";
import { AUDIT_PAGE_SIZE } from "../audit-constants";
import AuditEjecucionesView from "./AuditEjecucionesView";

type Tab = "solicitudes" | "ejecuciones";

const TABS: { id: Tab; label: string }[] = [
  { id: "solicitudes", label: "Solicitudes" },
  { id: "ejecuciones", label: "Ejecuciones" },
];

function SolicitudesTab() {
  const {
    events,
    total,
    hasMore,
    nextOffset,
    refreshing,
    loadingMore,
    filters,
    applyFilters,
    loadMore,
  } = useAudit();

  return (
    <div className="space-y-4">
      <AuditFilters filters={filters} onChange={applyFilters} />

      <p className="text-xs text-zinc-500">
        Mostrando {events.length} de {total} evento(s).
        {hasMore ? " Hay más registros — desplácese o use el botón para cargar." : ""}
      </p>

      <ResponsiveDataTable<EventoAuditoria>
        rows={events}
        columns={auditColumns}
        rowKey={(e) => e.id}
        loading={refreshing && events.length === 0}
        loadingMore={loadingMore}
        hasMore={hasMore}
        nextOffset={nextOffset}
        onLoadMore={() => void loadMore()}
        emptyTitle="Sin eventos registrados"
        emptyDescription="No hay eventos que coincidan con los filtros seleccionados."
      />

      {hasMore && (
        <div className="mt-2 flex justify-center">
          <button
            className="btn btn-outline"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Cargando..." : `Cargar más (${AUDIT_PAGE_SIZE} por página)`}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AuditView() {
  const [activeTab, setActiveTab] = useState<Tab>("solicitudes");

  return (
    <div className="space-y-4">
      {/* ── Pestañas ─────────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Secciones de auditoría"
        className="flex gap-1 border-b border-zinc-200"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`audit-panel-${tab.id}`}
            id={`audit-tab-${tab.id}`}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Contenido ────────────────────────────────────────────────────── */}
      <div
        role="tabpanel"
        id={`audit-panel-${activeTab}`}
        aria-labelledby={`audit-tab-${activeTab}`}
      >
        {activeTab === "solicitudes" && <SolicitudesTab />}
        {activeTab === "ejecuciones" && <AuditEjecucionesView />}
      </div>
    </div>
  );
}
