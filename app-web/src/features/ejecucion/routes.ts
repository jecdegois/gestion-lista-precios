import type { EjecucionKey } from "@/lib/domain-types";

export const EJECUCION_LABELS: Record<EjecucionKey, string> = {
  EJECUCION_PRECIOS: "Precios",
  EJECUCION_MARGEN: "Margen",
  EJECUCION_DESCUENTO: "Descuento",
};

/** Ruta de cada pestaña del módulo de Ejecución. */
export const ROUTE_BY_EJECUCION: Record<EjecucionKey, string> = {
  EJECUCION_PRECIOS: "/ejecucion/precios",
  EJECUCION_MARGEN: "/ejecucion/margen",
  EJECUCION_DESCUENTO: "/ejecucion/descuento",
};
