"use client";

import { useCallback, useRef, useState } from "react";
import type { TableLoadParams } from "@/components/newComponents/ResponsiveDataTable";
import type { FilaPrecio, TipoVariacion } from "@/lib/domain-types";
import { fetchGlobalManagementPage } from "../api/paged-api";
import { useOnChange } from "./useOnChange";

export const PAGE_SIZE = 200;
const FINDINGS_PAGE_SIZE = 50;

type Params = { level: string; factor: string; variationType: TipoVariacion };

/**
 * Simulación paginada de Gestión Global: impacto bajo demanda, hallazgos aparte y
 * cancelación de consultas obsoletas. Cambiar los parámetros invalida la simulación.
 */
export function useGlobalManagementSimulation(params: Params, initialRows: FilaPrecio[] | null, onInvalidate: () => void) {
  const { level, factor, variationType } = params;
  const [rows, setRows] = useState<FilaPrecio[] | null>(initialRows);
  const [simulated, setSimulated] = useState(Boolean(initialRows?.length));
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingFirst, setLoadingFirst] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [findings, setFindings] = useState<FilaPrecio[]>([]);
  const [findingsHasMore, setFindingsHasMore] = useState(false);
  const [findingsNextOffset, setFindingsNextOffset] = useState<number | null>(null);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Cualquier cambio de parámetros invalida la simulación previa (la del borrador hidratado se conserva).
  useOnChange(`${level}|${factor}|${variationType}`, () => {
    abortRef.current?.abort();
    requestRef.current += 1;
    setSimulated(false);
    setRows(null);
    setHasMore(false);
    setNextOffset(null);
    setFindings([]);
    setFindingsHasMore(false);
    setFindingsNextOffset(null);
    setLoadingFirst(false);
    setLoadingMore(false);
    onInvalidate();
  });

  const loadPage = useCallback(
    async ({ offset, limit }: TableLoadParams) => {
      if (!level) return;
      const requestId = ++requestRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const isMore = offset > 0;
      if (isMore) setLoadingMore(true);
      else setLoadingFirst(true);

      try {
        const page = await fetchGlobalManagementPage({ level, factor, variationType, offset, maxRecords: limit }, controller.signal);
        if (requestId !== requestRef.current) return;
        setRows((prev) => (offset === 0 ? page.filas : [...(prev ?? []), ...page.filas]));
        setHasMore(Boolean(page.hasMore));
        setNextOffset(page.nextOffset);
        setError(null);
        setSimulated(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestId !== requestRef.current) return;
        setError(err instanceof Error ? err.message : "No fue posible calcular la página de impacto de Gestión Global.");
        if (!isMore) {
          setRows([]);
          setSimulated(false);
        }
      } finally {
        if (requestId === requestRef.current) {
          if (isMore) setLoadingMore(false);
          else setLoadingFirst(false);
        }
      }
    },
    [factor, level, variationType],
  );

  const loadFindings = useCallback(
    async ({ offset, limit }: TableLoadParams) => {
      if (!level || loadingFindings) return;
      setLoadingFindings(true);
      try {
        const page = await fetchGlobalManagementPage({
          level,
          factor,
          variationType,
          offset,
          maxRecords: Math.min(limit, FINDINGS_PAGE_SIZE),
          findingsOnly: true,
        });
        setFindings((prev) => (offset === 0 ? page.filas : [...prev, ...page.filas]));
        setFindingsHasMore(Boolean(page.hasMore));
        setFindingsNextOffset(page.nextOffset);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No fue posible consultar los hallazgos completos.");
      } finally {
        setLoadingFindings(false);
      }
    },
    [loadingFindings, factor, level, variationType],
  );

  async function simulate() {
    await loadPage({ offset: 0, limit: PAGE_SIZE });
    await loadFindings({ offset: 0, limit: FINDINGS_PAGE_SIZE });
  }

  /** Todas las filas del impacto, página por página (para exportar). */
  async function fetchAllRows() {
    const all: FilaPrecio[] = [];
    let offset = 0;
    let more = true;
    while (more) {
      const page = await fetchGlobalManagementPage({ level, factor, variationType, offset, maxRecords: PAGE_SIZE });
      all.push(...page.filas);
      more = page.hasMore && page.filas.length > 0;
      offset = page.nextOffset ?? offset + page.filas.length;
    }
    return all;
  }

  return {
    rows,
    simulated,
    simulating: loadingFirst || loadingMore,
    error,
    page: { hasMore, nextOffset, loadingMore, loadPage },
    findings: { rows: findings, hasMore: findingsHasMore, nextOffset: findingsNextOffset, loading: loadingFindings, load: loadFindings },
    simulate,
    fetchAllRows,
  };
}
