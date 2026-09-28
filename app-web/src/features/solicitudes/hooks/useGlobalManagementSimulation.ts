"use client";

import { useCallback, useRef, useState } from "react";
import type { TableLoadParams } from "@/components/newComponents/ResponsiveDataTable";
import type { FilaPrecio, TipoVariacion } from "@/lib/domain-types";
import { fetchGlobalManagementPage } from "../api/paged-api";
import { useOnChange } from "./useOnChange";

export const PAGE_SIZE = 100;
const FINDINGS_PAGE_SIZE = 100;

type Params = { level: string; factor: string; variationType: TipoVariacion };

/**
 * Simulación paginada de Gestión Global: impacto y hallazgos son consultas
 * independientes, ambas de 100 en 100.
 *
 * Visibilidad de tablas: `everSimulated` es un estado boolean que solo va de
 * false → true y nunca vuelve atrás. Esto desacopla la visibilidad de las
 * tablas de cualquier cambio de estado causado por loadingFindings, setFindings,
 * re-renders de React 18 batching u otros efectos secundarios. Una vez que
 * `loadPage` recibe su primera respuesta exitosa, las tablas quedan montadas
 * permanentemente mientras el componente esté en el DOM.
 */
export function useGlobalManagementSimulation(
  params: Params,
  initialRows: FilaPrecio[] | null,
  onInvalidate: () => void,
) {
  const { level, factor, variationType } = params;

  // ── Estado de precios ─────────────────────────────────────────────────────
  const [rows, setRows] = useState<FilaPrecio[] | null>(initialRows);
  const [simulated, setSimulated] = useState(Boolean(initialRows?.length));
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingFirst, setLoadingFirst] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ── Estado de hallazgos ───────────────────────────────────────────────────
  const [findings, setFindings] = useState<FilaPrecio[]>([]);
  const [findingsHasMore, setFindingsHasMore] = useState(false);
  const [findingsNextOffset, setFindingsNextOffset] = useState<number | null>(null);
  const [loadingFindings, setLoadingFindings] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Estado one-way: false → true, nunca vuelve a false.
  // Controla si las tablas están montadas. Ningún re-render causado por
  // findings ni por loadingFindings puede devolverlo a false.
  const [everSimulated, setEverSimulated] = useState(Boolean(initialRows?.length));

  // ── Refs para cancelación — un AbortController independiente por tabla ────
  const priceReqRef = useRef(0);
  const priceAbortRef = useRef<AbortController | null>(null);
  const findingsReqRef = useRef(0);
  const findingsAbortRef = useRef<AbortController | null>(null);
  // Ref para el guard de duplicados de hallazgos (evita stale-closure con useState)
  const loadingFindingsRef = useRef(false);

  // ── Invalidación por cambio de parámetros ─────────────────────────────────
  // Las filas visibles NO se borran: las tablas conservan el último resultado
  // hasta que el usuario vuelve a simular con los nuevos parámetros.
  useOnChange(`${level}|${factor}|${variationType}`, () => {
    priceAbortRef.current?.abort();
    priceReqRef.current += 1;
    findingsAbortRef.current?.abort();
    findingsReqRef.current += 1;

    setSimulated(false);
    setHasMore(false);
    setNextOffset(null);
    setFindingsHasMore(false);
    setFindingsNextOffset(null);
    setLoadingFirst(false);
    setLoadingMore(false);
    setLoadingFindings(false);
    loadingFindingsRef.current = false;
    setError(null);
    onInvalidate();
  });

  // ── Carga de precios ──────────────────────────────────────────────────────
  const loadPage = useCallback(
    async ({ offset, limit }: TableLoadParams) => {
      if (!level) return;
      const requestId = ++priceReqRef.current;
      priceAbortRef.current?.abort();
      const controller = new AbortController();
      priceAbortRef.current = controller;

      const isMore = offset > 0;
      if (isMore) setLoadingMore(true);
      else setLoadingFirst(true);

      try {
        const page = await fetchGlobalManagementPage(
          { level, factor, variationType, offset, maxRecords: Math.min(limit, PAGE_SIZE) },
          controller.signal,
        );
        if (requestId !== priceReqRef.current) return;
        setRows((prev) => (offset === 0 ? page.filas : [...(prev ?? []), ...page.filas]));
        setHasMore(Boolean(page.hasMore));
        setNextOffset(page.nextOffset);
        setError(null);
        setSimulated(true);
        // One-way: se activa aquí y nunca se desactiva
        setEverSimulated(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestId !== priceReqRef.current) return;
        setError(err instanceof Error ? err.message : "No fue posible calcular la página de impacto de Gestión Global.");
        if (!isMore) setSimulated(false);
      } finally {
        if (requestId === priceReqRef.current) {
          if (isMore) setLoadingMore(false);
          else setLoadingFirst(false);
        }
      }
    },
    [factor, level, variationType],
  );

  // ── Carga de hallazgos (consulta independiente) ───────────────────────────
  const loadFindings = useCallback(
    async ({ offset, limit }: TableLoadParams) => {
      if (!level) return;
      // Guard contra duplicados usando ref (no state, para evitar stale closures)
      if (loadingFindingsRef.current && offset > 0) return;

      const requestId = ++findingsReqRef.current;
      findingsAbortRef.current?.abort();
      const controller = new AbortController();
      findingsAbortRef.current = controller;

      loadingFindingsRef.current = true;
      setLoadingFindings(true);

      try {
        const page = await fetchGlobalManagementPage(
          {
            level,
            factor,
            variationType,
            offset,
            maxRecords: Math.min(limit, FINDINGS_PAGE_SIZE),
            findingsOnly: true,
          },
          controller.signal,
        );
        if (requestId !== findingsReqRef.current) return;
        setFindings((prev) => (offset === 0 ? page.filas : [...prev, ...page.filas]));
        setFindingsHasMore(Boolean(page.hasMore));
        setFindingsNextOffset(page.nextOffset);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestId !== findingsReqRef.current) return;
        setError(err instanceof Error ? err.message : "No fue posible consultar los hallazgos.");
      } finally {
        if (requestId === findingsReqRef.current) {
          loadingFindingsRef.current = false;
          setLoadingFindings(false);
        }
      }
    },
    [factor, level, variationType],
  );

  // ── simulate: dispara ambas tablas en paralelo ────────────────────────────
  async function simulate() {
    // Limpiar hallazgos del resultado anterior antes de la nueva consulta.
    // No se incrementa findingsReqRef aquí — loadFindings ya lo hace
    // internamente con ++findingsReqRef.current. Incrementarlo dos veces
    // causaría que el requestId capturado no coincida con current y la
    // respuesta sea descartada, generando una segunda llamada innecesaria.
    setFindings([]);
    setFindingsHasMore(false);
    setFindingsNextOffset(null);

    await Promise.all([
      loadPage({ offset: 0, limit: PAGE_SIZE }),
      loadFindings({ offset: 0, limit: FINDINGS_PAGE_SIZE }),
    ]);
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
    everSimulated,
    simulating: loadingFirst || loadingMore,
    error,
    page: { hasMore, nextOffset, loadingMore, loadPage },
    findings: {
      rows: findings,
      hasMore: findingsHasMore,
      nextOffset: findingsNextOffset,
      loading: loadingFindings,
      load: loadFindings,
    },
    simulate,
    fetchAllRows,
  };
}
