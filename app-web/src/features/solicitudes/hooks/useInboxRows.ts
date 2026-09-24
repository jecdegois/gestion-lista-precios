"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TableLoadParams } from "@/components/newComponents/ResponsiveDataTable";
import type { Solicitud } from "@/lib/domain-types";
import { byNewest } from "../utils/inbox-filters";

export const INBOX_PAGE_SIZE = 20;

/**
 * Filas mostradas en la bandeja con carga incremental. Al cambiar los filtros se
 * reinicia la primera página; al refrescar los datos se actualizan las filas visibles
 * sin perder el scroll y se agregan las nuevas.
 */
export function useInboxRows(requests: Solicitud[], filtered: Solicitud[], filtersKey: string) {
  const [displayed, setDisplayed] = useState<Solicitud[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const previousCount = useRef(0);
  const previousFilters = useRef(filtersKey);

  useEffect(() => {
    const total = filtered.length;
    const filtersChanged = previousFilters.current !== filtersKey;
    previousFilters.current = filtersKey;

    setDisplayed((prev) => {
      if (filtersChanged || prev.length === 0 || total !== previousCount.current) {
        previousCount.current = total;
        return filtered.slice(0, INBOX_PAGE_SIZE).sort(byNewest);
      }
      const updated = prev.map((row) => filtered.find((s) => s.id === row.id) ?? row);
      const visibleIds = new Set(prev.map((s) => s.id));
      const added = filtered.filter((s) => !visibleIds.has(s.id));
      previousCount.current = total;
      return (added.length > 0 ? [...added, ...updated] : updated).sort(byNewest);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, filtersKey]);

  const loadMore = useCallback(
    async ({ offset, limit }: TableLoadParams) => {
      if (offset >= filtered.length) return;
      setLoadingMore(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const next = filtered.slice().sort(byNewest).slice(offset, offset + limit);
        if (next.length > 0) setDisplayed((prev) => [...prev, ...next]);
      } finally {
        setLoadingMore(false);
      }
    },
    [filtered],
  );

  return { displayed, loadingMore, hasMore: displayed.length < filtered.length, nextOffset: displayed.length, loadMore };
}
