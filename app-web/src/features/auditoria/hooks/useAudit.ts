"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/shared/components/layout/PortalProviders";
import type { EventoAuditoria } from "@/lib/domain-types";
import { getEventos } from "../api/auditoria-api";
import { AUDIT_PAGE_SIZE } from "../audit-constants";
import { type AuditFilters, AUDIT_FILTERS_DEFAULT, toApiParams } from "../components/AuditFilters";

/**
 * Eventos de auditoría paginados 50 en 50, filtrados server-side.
 * Patrón análogo al useInbox de la bandeja de solicitudes.
 */
export function useAudit() {
  const pushToast = useToast();

  const [events, setEvents] = useState<EventoAuditoria[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [filters, setFilters] = useState<AuditFilters>(AUDIT_FILTERS_DEFAULT);

  // Ref para evitar fetch duplicados cuando los filtros cambian
  const pendingFetch = useRef(false);

  // ── Carga inicial / recarga al cambiar filtros ─────────────────────────────
  const refresh = useCallback(
    async (activeFilters: AuditFilters) => {
      if (pendingFetch.current) return;
      pendingFetch.current = true;
      setRefreshing(true);
      try {
        const res = await getEventos({ offset: 0, limit: AUDIT_PAGE_SIZE, ...toApiParams(activeFilters) });
        if (res.ok) {
          setEvents(res.data.eventos);
          setTotal(res.data.total);
          setHasMore(res.data.hasMore);
          setNextOffset(res.data.nextOffset);
        } else {
          pushToast(res.error, "error");
        }
      } finally {
        setRefreshing(false);
        pendingFetch.current = false;
      }
    },
    [pushToast],
  );

  // Carga inicial
  useEffect(() => {
    void refresh(AUDIT_FILTERS_DEFAULT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recarga al cambiar filtros (debounce mínimo para el campo texto)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyFilters = useCallback(
    (next: AuditFilters) => {
      setFilters(next);
      // Para los dropdowns (rol/evento) el cambio es inmediato
      // Para el campo search, espera 400ms para evitar fetch por cada tecla
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      const isSearchChange = next.search !== filters.search;
      if (isSearchChange) {
        searchTimeoutRef.current = setTimeout(() => void refresh(next), 400);
      } else {
        void refresh(next);
      }
    },
    [filters.search, refresh],
  );

  // ── Paginación incremental (load more) ────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!hasMore || nextOffset == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getEventos({
        offset: nextOffset,
        limit: AUDIT_PAGE_SIZE,
        ...toApiParams(filters),
      });
      if (res.ok) {
        setEvents((prev) => {
          const ids = new Set(prev.map((e) => e.id));
          const nuevos = res.data.eventos.filter((e) => !ids.has(e.id));
          return [...prev, ...nuevos];
        });
        setTotal(res.data.total);
        setHasMore(res.data.hasMore);
        setNextOffset(res.data.nextOffset);
      } else {
        pushToast(res.error, "error");
      }
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextOffset, loadingMore, filters, pushToast]);

  return {
    events,
    total,
    hasMore,
    nextOffset,
    refreshing,
    loadingMore,
    filters,
    applyFilters,
    refresh: () => void refresh(filters),
    loadMore,
  };
}
