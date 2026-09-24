"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DropdownLoadParams } from "@/components/newComponents/Dropdown";
import type { ArticuloCatalogo } from "@/lib/domain-types";
import { fetchArticlesPage } from "../api/paged-api";

export const ARTICLES_PAGE_SIZE = 50;

/**
 * Buscador paginado de artículos de una lista de precio, con selección. Se reinicia
 * al cambiar de lista o al deshabilitarse (p. ej. en modalidad Excel).
 */
export function useArticleSearch(level: string, enabled: boolean) {
  const [articles, setArticles] = useState<ArticuloCatalogo[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ArticuloCatalogo | null>(null);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async ({ query, offset, maxRecords }: DropdownLoadParams) => {
      if (!enabled || !level) return;
      const requestId = ++requestRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const isMore = offset > 0;
      if (isMore) setLoadingMore(true);
      else setLoading(true);

      try {
        const page = await fetchArticlesPage({ level, query, offset, maxRecords }, controller.signal);
        if (requestId !== requestRef.current) return;
        setArticles((prev) => {
          const merged = offset === 0 ? page.items : [...prev, ...page.items];
          return Array.from(new Map(merged.map((a) => [a.codigo, a])).values());
        });
        setHasMore(Boolean(page.hasMore));
        setNextOffset(page.nextOffset);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestId === requestRef.current) {
          setError(err instanceof Error ? err.message : "No fue posible consultar los artículos de la lista de precio.");
        }
      } finally {
        if (requestId === requestRef.current) {
          if (isMore) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [enabled, level],
  );

  // Al cambiar de lista (o de modalidad) se reinicia el buscador de artículos.
  useEffect(() => {
    abortRef.current?.abort();
    requestRef.current += 1;
    setSelected(null);
    setArticles([]);
    setHasMore(false);
    setNextOffset(null);
    setLoading(false);
    setLoadingMore(false);
    if (!enabled || !level) return;
    void load({ query: "", offset: 0, maxRecords: ARTICLES_PAGE_SIZE });
    return () => {
      abortRef.current?.abort();
      requestRef.current += 1;
    };
  }, [load, enabled, level]);

  // El artículo seleccionado se mantiene entre las opciones aunque la búsqueda actual no lo incluya.
  const options = selected && !articles.some((a) => a.codigo === selected.codigo) ? [selected, ...articles] : articles;

  return { articles, options, hasMore, nextOffset, loading, loadingMore, error, selected, setSelected, load };
}
