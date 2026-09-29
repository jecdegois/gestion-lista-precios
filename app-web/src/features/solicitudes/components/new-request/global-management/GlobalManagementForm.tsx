"use client";

import { useMemo, useState } from "react";
import TablaImpactoGestionGlobal from "@/components/newComponents/TablaImpactoGestionGlobal";
import type { SelectOption } from "@/components/newComponents/Dropdown";
import { calcularVariacion } from "@/lib/preview";
import type { FilaPrecio, TipoVariacion } from "@/lib/domain-types";
import type { SolicitudInput } from "../../../schemas/solicitud-schema";
import type { ProcessFormProps } from "../../../types";
import { draftValues } from "../../../utils/draft-values";
import { useGlobalManagementCatalog } from "../../../hooks/useGlobalManagementCatalog";
import { useGlobalManagementSimulation } from "../../../hooks/useGlobalManagementSimulation";
import { useRequestSubmission } from "../../../hooks/useRequestSubmission";
import { useSimulationExport } from "../../../hooks/useSimulationExport";
import ProcessFormLayout from "../shared/ProcessFormLayout";
import RequestActions from "../shared/RequestActions";
import SimulationResult from "../shared/SimulationResult";
import GlobalManagementFields from "./GlobalManagementFields";

/** Tipo de variación del borrador; sin dato explícito se deduce del multiplicador. */
function draftVariationType(draft: ProcessFormProps["draft"]): TipoVariacion {
  const params = draft?.parametros;
  if (!params) return "DISMINUCION";
  return params.tipoVariacion ?? (Number(params.multiplicador) < 1 ? "DISMINUCION" : "AUMENTO");
}

export default function GlobalManagementForm({ readOnly, consultOnly, draft, onSubmitted, onDiscardDraft }: ProcessFormProps) {
  const lockInput = readOnly && !consultOnly;
  const initialType = draftVariationType(draft);
  const initial = draftValues(draft, initialType);
  const [level, setLevel] = useState(initial.level);
  const [variationType, setVariationType] = useState<TipoVariacion>(initialType);
  const [factor, setFactor] = useState(initial.factor);

  const catalog = useGlobalManagementCatalog();
  const submission = useRequestSubmission({
    draft,
    onSubmitted,
    onReset: () => {
      setLevel("");
      setFactor("");
    },
  });
  const simulation = useGlobalManagementSimulation(
    { level, factor, variationType },
    draft?.filas?.length ? (draft.filas as FilaPrecio[]) : null,
    () => submission.setSent(false),
  );
  const { exporting, exportRows } = useSimulationExport("factor_precio", "Variación %");

  const conversion = useMemo(() => calcularVariacion(variationType, factor), [factor, variationType]);
  const selectedList = catalog.lists.find((list) => list.codigo === level);
  const levelMissing = !!level && !catalog.levels.some((item) => item.codigo === level);
  const fieldsComplete = !!level && conversion.valido && !levelMissing;
  const rows = simulation.rows;
  // Las tablas se muestran en cuanto hay una simulación en curso o ya hubo
  // al menos una. El estado `everSimulated` solo va de false → true, por lo
  // que las tablas permanecen montadas independientemente de cualquier
  // re-render causado por findings, loadingFindings u otros efectos secundarios.
  const showTables = simulation.everSimulated || simulation.simulating;
  const canSubmit = simulation.simulated && fieldsComplete && !readOnly && !simulation.simulating;

  const levelOptions: SelectOption[] = catalog.lists
    .filter((list) => list.codigo.toUpperCase() !== "MAYOREOD")
    .map((list) => ({ value: list.codigo, label: list.nombre || list.codigo }));

  function buildRequest(): SolicitudInput {
    return {
      proceso: "FACTOR_PRECIO",
      modalidad: "manual",
      parametros: {
        nivel: level,
        factor,
        multiplicador: conversion.factor,
        tipoVariacion: variationType,
        variacionPorcentaje: factor,
        nivelPrecio: level || undefined,
      },
      // El servicio construye la fila resumen a partir de los parámetros;
      // el formulario no envía artículos simulados para Gestión Global.
      filas: [] as unknown as SolicitudInput["filas"],
    };
  }

  return (
    <ProcessFormLayout
      process="FACTOR_PRECIO"
      draftId={submission.draftId}
      onDiscardDraft={onDiscardDraft}
      catalogStatus={{ loading: catalog.loading, error: catalog.error, noLevels: catalog.levels.length === 0 }}
    >
      <GlobalManagementFields
        level={level}
        levelOptions={levelOptions}
        selectedList={selectedList}
        variationType={variationType}
        factor={factor}
        conversion={conversion}
        disabled={lockInput}
        loadingCatalog={catalog.loading}
        onLevelChange={setLevel}
        onVariationTypeChange={setVariationType}
        onFactorChange={setFactor}
      />
      {simulation.error && <p className="text-[11px] text-red-600 mb-3">{simulation.error}</p>}

      <RequestActions
        canSimulate={!lockInput && fieldsComplete && !simulation.simulating}
        simulating={simulation.simulating}
        onSimulate={() => void simulation.simulate()}
        canSave={fieldsComplete && simulation.simulated && !!rows?.length}
        canSubmit={canSubmit}
        submission={submission}
        onSave={() => void submission.saveDraft(buildRequest())}
        onSubmit={() => canSubmit && void submission.submit(buildRequest())}
      />

      {showTables && (
        <SimulationResult
          exporting={exporting}
          exportDisabled={simulation.simulating}
          onExport={() => void exportRows(simulation.fetchAllRows)}
        >
          {simulation.page.hasMore && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5 text-xs text-blue-800 mb-3">
              Se muestra una página del impacto. El resto de los artículos se consulta bajo demanda; no es necesario cargar toda la
              lista para enviar la solicitud.
            </div>
          )}
          <TablaImpactoGestionGlobal
            filas={rows ?? []}
            hallazgos={simulation.findings.rows}
            hallazgosHasMore={simulation.findings.hasMore}
            hallazgosNextOffset={simulation.findings.nextOffset}
            hallazgosLoadingMore={simulation.findings.loading}
            hallazgosCargando={simulation.findings.loading}
            onLoadMoreHallazgos={simulation.findings.load}
            hasMore={simulation.page.hasMore}
            nextOffset={simulation.page.nextOffset}
            loadingMore={simulation.page.loadingMore}
            onLoadMore={simulation.page.loadPage}
          />
        </SimulationResult>
      )}
    </ProcessFormLayout>
  );
}
