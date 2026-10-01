"use client";

import ResponsiveDataTable from "@/shared/components/ui/ResponsiveDataTable";
import type { EjecucionKey, EjecucionLog } from "@/shared/types/domain-types";
import { EJECUCION_LABELS } from "../routes";
import { ejecucionColumns, ejecucionRowClass } from "./table/ejecucion-columns";

// El tipo ya va en el encabezado de la sección.
const columns = ejecucionColumns.filter((c) => c.key !== "tipo");

interface UltimasEjecucionesProps {
  registros: EjecucionLog[];
  tipoActivo: EjecucionKey;
}

export default function UltimasEjecuciones({ registros, tipoActivo }: UltimasEjecucionesProps) {
  const label = EJECUCION_LABELS[tipoActivo];
  const filtrados = registros.filter((r) => r.tipo === tipoActivo);

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold mb-1">Últimas ejecuciones</h2>
      <p className="text-xs text-zinc-500 mb-4">
        Tipo activo: <span className="font-medium">{label}</span>
        {filtrados.length > 0 && ` · ${filtrados.length} registro${filtrados.length !== 1 ? "s" : ""}`}
      </p>
      <ResponsiveDataTable<EjecucionLog>
        rows={filtrados}
        columns={columns}
        rowKey={(r) => r.id}
        rowClassName={ejecucionRowClass}
        emptyTitle="Sin ejecuciones registradas"
        emptyDescription={`No hay ejecuciones de tipo ${label} aún.`}
        tableHeightClass="max-h-[50vh]"
      />
    </div>
  );
}
