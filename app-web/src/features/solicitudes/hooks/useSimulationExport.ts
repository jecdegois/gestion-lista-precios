"use client";

import { useState } from "react";
import { useToast } from "@/shared/components/layout/PortalProviders";
import { descargarSimulacionExcel } from "@/lib/export-simulation";
import type { FilaResultado } from "@/lib/domain-types";

/** Exporta a Excel las filas simuladas; `getRows` puede ser asíncrono (p. ej. traer todas las páginas). */
export function useSimulationExport(fileSlug: string, variationLabel: string) {
  const pushToast = useToast();
  const [exporting, setExporting] = useState(false);

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
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "No fue posible exportar la simulación.", "error");
    } finally {
      setExporting(false);
    }
  }

  return { exporting, exportRows };
}
