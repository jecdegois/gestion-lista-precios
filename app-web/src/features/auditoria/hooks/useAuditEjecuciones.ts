"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/shared/components/layout/PortalProviders";
import type { EjecucionLog } from "@/lib/domain-types";
import {
  getEjecucionesAudit,
  AUDIT_EXEC_PAGE_SIZE,
} from "../api/ejecuciones-audit-api";
import {
  type AuditEjecucionFilters,
  AUDIT_EJECUCION_FILTERS_DEFAULT,
  toEjecucionApiParams,
} from "../components/AuditEjecucionFilters";

/**
 * Ejecuciones directas paginadas 50 en 50 para la pestaña de Auditoría.
 * Patrón idéntico a useAudit (solicitudes).
 */
export function useAuditEjecuciones() {
  const pushToast = useToast();

  const [ejecuciones, setEjecuciones] = useState<EjecucionLog[]>([]);
  const [total,       setTotal]       = useState(0);
  const [hasMore,     setHasMore]     = useState(false);
  const [nextOffset,  setNextOffset]  = useState<number | null>(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters,     setFilters]     = useState<AuditEjecucionFilters>(AUDIT_EJECUCION_FILTERS_DEFAULT);

  const pendingFetch    = useRef(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Carga / recarga ────────────────────────────────────────────────────────
  const refresh = useCallback(
    async (activeFilters: AuditEjecucionFilters) => {
      if (pendingFetch.current) return;
      pendingFetch.current = true;
      setRefreshing(true);
      try {
        const res = await getEjecucionesAudit({
          offset: 0,
          limit: AUDIT_EXEC_PAGE_SIZE,
          ...toEjecucionApiParams(activeFilters),
        });
        if (res.ok) {
          setEjecuciones(res.data.ejecuciones);
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

  // Carga inicial (solo al montar)
  useEffect(() => {
    void refresh(AUDIT_EJECUCION_FILTERS_DEFAULT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cambio de filtros con debounce en búsqueda de texto ───────────────────
  const applyFilters = useCallback(
    (next: AuditEjecucionFilters) => {
      setFilters(next);
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

  // ── Paginación incremental ─────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!hasMore || nextOffset == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getEjecucionesAudit({
        offset: nextOffset,
        limit: AUDIT_EXEC_PAGE_SIZE,
        ...toEjecucionApiParams(filters),
      });
      if (res.ok) {
        setEjecuciones((prev) => {
          const ids = new Set(prev.map((e) => e.id));
          return [...prev, ...res.data.ejecuciones.filter((e) => !ids.has(e.id))];
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
    ejecuciones,
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
