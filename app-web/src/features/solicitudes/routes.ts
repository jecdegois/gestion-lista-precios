import type { ProcesoKey } from "@/lib/domain-types";

/** Ruta de la pestaña de Nueva Solicitud para cada proceso. */
export const ROUTE_BY_PROCESS: Record<ProcesoKey, string> = {
  FACTOR_PRECIO: "/solicitudes/nueva/gestion-global",
  MAYOREOD_MASIVO: "/solicitudes/nueva/precio-base",
  DESCUENTO_LISTA_PRECIO: "/solicitudes/nueva/descuento",
  MARGEN_UTILIDAD_MASIVO: "/solicitudes/nueva/margen",
};

/** Ruta para retomar un borrador en su pestaña. */
export function resumeDraftRoute(process: ProcesoKey, id: string): string {
  return `${ROUTE_BY_PROCESS[process]}?borrador=${encodeURIComponent(id)}`;
}
