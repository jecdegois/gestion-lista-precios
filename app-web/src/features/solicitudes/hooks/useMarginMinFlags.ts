"use client";

import { useEffect, useState } from "react";
import { getCatalogoGestionGlobal } from "../api/solicitudes-api";

/**
 * GESTION_LISTAS_PRECIOS.VALIDAR_PRECIO_BAJO_MARGEN_MIN por lista (valor vigente).
 * Si la consulta falla queda todo en false: el servidor re-valida al enviar y aprobar.
 */
export function useMarginMinFlags() {
  const [activas, setActivas] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void getCatalogoGestionGlobal()
      .then((res) => {
        if (cancelled || !res.ok) return;
        setActivas(new Set(res.data.listas.filter((l) => l.validarPrecioBajoMargenMin).map((l) => l.codigo.trim().toUpperCase())));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return (lista: string | null | undefined) => activas.has(String(lista ?? "").trim().toUpperCase());
}
