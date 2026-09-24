"use client";

import { useEffect, useState } from "react";
import type { ArticuloCatalogo } from "@/lib/domain-types";
import type { NivelPrecio } from "@/lib/types";
import { getCatalogoSolicitud } from "../api/solicitudes-api";

/** Niveles de precio de la compañía y, opcionalmente, el catálogo de artículos del nivel. */
export function useRequestCatalog(level: string, includeArticles: boolean) {
  const [levels, setLevels] = useState<NivelPrecio[]>([]);
  const [articles, setArticles] = useState<ArticuloCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryLevel = includeArticles ? level : "";

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void getCatalogoSolicitud(queryLevel || undefined, includeArticles && !!queryLevel).then((res) => {
      if (!current) return;
      if (res.ok) {
        setLevels(res.data.niveles);
        setArticles(res.data.articulos);
      } else {
        setLevels([]);
        setArticles([]);
        setError(res.error);
      }
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [queryLevel, includeArticles]);

  return { levels, articles, loading, error };
}

/** Selecciona la lista base (o la primera) en cuanto llegan los niveles, si no hay una elegida. */
export function useDefaultLevel(level: string, levels: NivelPrecio[], baseCode: string, setLevel: (code: string) => void) {
  useEffect(() => {
    if (level || levels.length === 0) return;
    const base = levels.find((l) => l.codigo.toUpperCase() === baseCode) ?? levels[0];
    setLevel(base.codigo);
  }, [level, levels, baseCode, setLevel]);
}
