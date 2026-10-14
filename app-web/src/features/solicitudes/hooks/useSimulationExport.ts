"use client";

import { useState } from "react";
import { notify } from "@/shared/notifications/notify";
import { descargarSimulacionExcel } from "@/features/solicitudes/utils/export-simulation";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import type { FilaResultado } from "@/shared/types/domain-types";

/** Exporta a Excel las filas simuladas; `getRows` puede ser asíncrono (p. ej. traer todas las páginas). */
export function useSimulationExport(fileSlug: string, variationLabel: string, modo?: "precioBase") {
  const [exporting, setExporting] = useState(false);
  const monedaLocal = useCurrentUser().moneda ?? "";

  /**
   * @param getRows        - Función (síncrona o asíncrona) que retorna las filas a exportar.
   * @param mensajeListaBase - Cuando se recibe, omite la columna "Lista" y agrega hoja "Información"
   *                           con la nota descriptiva de la lista padre (uso exclusivo Gestión Global).
   */
  async function exportRows(
    getRows: () => FilaResultado[] | Promise<FilaResultado[]>,
    mensajeListaBase?: string,
  ) {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = await getRows();
      if (!rows.length) return;
      descargarSimulacionExcel(
        rows,
        `simulacion-${fileSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`,
        variationLabel,
        mensajeListaBase,
        modo,
        monedaLocal,
      );
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "No fue posible exportar la simulación.");
    } finally {
      setExporting(false);
    }
  }

  return { exporting, exportRows };
}
