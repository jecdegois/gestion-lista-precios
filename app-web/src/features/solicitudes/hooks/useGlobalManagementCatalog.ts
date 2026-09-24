"use client";

import { useEffect, useState } from "react";
import type { GestionGlobalLista, NivelPrecio } from "@/lib/types";
import { getCatalogoGestionGlobal } from "../api/solicitudes-api";

/** Listas de Gestión Global (con versión y variación vigente) y niveles de precio maestros. */
export function useGlobalManagementCatalog() {
  const [lists, setLists] = useState<GestionGlobalLista[]>([]);
  const [levels, setLevels] = useState<NivelPrecio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void getCatalogoGestionGlobal().then((res) => {
      if (!current) return;
      if (res.ok) {
        setLists(res.data.listas);
        setLevels(res.data.niveles);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, []);

  return { lists, levels, loading, error };
}
