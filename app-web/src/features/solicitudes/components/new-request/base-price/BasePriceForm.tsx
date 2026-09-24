"use client";

import { useMemo, useState } from "react";
import TablaImpactoActualizacionMasiva from "@/components/newComponents/TablaImpactoActualizacionMasiva";
import type { SelectOption } from "@/components/newComponents/Dropdown";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import { calcularVariacion } from "@/lib/preview";
import type { CriteriosArticulo, FilaPrecio, FilaResultado } from "@/lib/domain-types";
import { simularManual } from "../../../api/solicitudes-api";
import type { SolicitudInput } from "../../../schemas/solicitud-schema";
import type { EntryMode, ProcessFormProps, UploadedFile } from "../../../types";
import { draftFile, draftValues, EMPTY_FILE } from "../../../utils/draft-values";
import { filterByCriteria, setCriterion } from "../../../utils/classifications";
import { useOnChange } from "../../../hooks/useOnChange";
import { useDefaultLevel, useRequestCatalog } from "../../../hooks/useRequestCatalog";
import { useRequestSubmission } from "../../../hooks/useRequestSubmission";
import { useSimulationExport } from "../../../hooks/useSimulationExport";
import EntryModeTabs from "../shared/EntryModeTabs";
import ExcelUpload from "../shared/ExcelUpload";
import ProcessFormLayout from "../shared/ProcessFormLayout";
import RequestActions from "../shared/RequestActions";
import SimulationResult from "../shared/SimulationResult";
import BasePriceManualCapture from "./BasePriceManualCapture";

const BASE_LIST = "MAYOREOD";
const ARTICLE_GROUP = "Criterios seleccionados";

export default function BasePriceForm({ readOnly, consultOnly, draft, onSubmitted, onDiscardDraft }: ProcessFormProps) {
  const company = useCurrentUser().compania ?? "";
  const lockInput = readOnly && !consultOnly;
  const initial = draftValues(draft, "DISMINUCION");

  const [mode, setMode] = useState<EntryMode>(draft?.modalidad ?? "manual");
  const [level, setLevel] = useState(initial.level);
  const [factor, setFactor] = useState(initial.factor);
  const [criteria, setCriteria] = useState<CriteriosArticulo>(draft?.parametros?.criteriosArticulo ?? {});
  // Un borrador de Precio Base solo pudo guardarse tras aceptar el impacto.
  const [acknowledged, setAcknowledged] = useState(Boolean(draft));
  const [rows, setRows] = useState<FilaResultado[] | null>(draft?.filas?.length ? draft.filas : null);
  const [simulated, setSimulated] = useState(Boolean(draft?.filas?.length));
  const [file, setFile] = useState<UploadedFile>(draftFile(draft));
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const catalog = useRequestCatalog(level, true);
  useDefaultLevel(level, catalog.levels, BASE_LIST, setLevel);
  const { exporting, exportRows } = useSimulationExport("mayoreod_masivo", "Descuento %");
  const submission = useRequestSubmission({ draft, onSubmitted, onReset: () => selectMode(mode) });

  const isExcel = mode === "excel";
  const conversion = useMemo(() => calcularVariacion("DISMINUCION", factor), [factor]);
  const levelName = catalog.levels.find((l) => l.codigo === level)?.nombre || level;
  const levelOptions: SelectOption[] = catalog.levels
    .filter((l) => l.codigo.toUpperCase() === BASE_LIST)
    .map((l) => ({ value: l.codigo, label: l.nombre || l.codigo }));
  const articleCodes = filterByCriteria(catalog.articles, criteria).map((a) => a.codigo);
  const errorCount = rows ? rows.filter((r) => !r.validacion.valido).length : 0;

  const fieldsComplete = isExcel
    ? !!rows && rows.every((r) => r.validacion.valido) && !!company
    : articleCodes.length > 0 && conversion.valido && acknowledged;
  const canSubmit = simulated && fieldsComplete && !readOnly;

  // Cambiar la lista limpia los criterios; cualquier cambio de parámetros invalida la simulación.
  useOnChange(level, () => setCriteria({}));
  useOnChange(JSON.stringify([level, factor, criteria]), () => {
    setSimulated(false);
    submission.setSent(false);
  });

  function selectMode(next: EntryMode) {
    setMode(next);
    setLevel("");
    setCriteria({});
    setFactor("");
    setAcknowledged(false);
    setSimulated(false);
    setRows(null);
    setFile(EMPTY_FILE);
    setSimulationError(null);
  }

  async function simulate() {
    if (isExcel) {
      setSimulated(true);
      return;
    }
    const res = await simularManual({
      proceso: "MAYOREOD_MASIVO",
      nivel: level,
      nivelBase: level,
      factor,
      tipoVariacion: "DISMINUCION",
      grupoArticulos: ARTICLE_GROUP,
      criteriosArticulo: { ...criteria },
      codigosArticulos: articleCodes,
    });
    if (!res.ok) {
      setSimulationError(res.error);
      setRows([]);
      setSimulated(false);
      return;
    }
    setSimulationError(null);
    setRows(res.data.filas);
    setSimulated(true);
  }

  function buildRequest(): SolicitudInput {
    return {
      proceso: "MAYOREOD_MASIVO",
      // Precio Base siempre se registra como "manual", también cuando viene de plantilla (comportamiento heredado).
      modalidad: "manual",
      parametros: {
        nivel: level,
        factor,
        multiplicador: conversion.factor,
        tipoVariacion: "DISMINUCION",
        variacionPorcentaje: factor,
        listaBase: level,
        nivelPrecio: level || undefined,
        grupoArticulos: ARTICLE_GROUP,
        criteriosArticulo: criteria,
        codigosArticulos: articleCodes,
      },
      filas: (rows ?? []) as unknown as SolicitudInput["filas"],
      archivoNombre: file.name,
      archivoS3Key: file.s3Key,
    };
  }

  return (
    <ProcessFormLayout
      process="MAYOREOD_MASIVO"
      draftId={submission.draftId}
      onDiscardDraft={onDiscardDraft}
      catalogStatus={{ loading: catalog.loading, error: catalog.error, noLevels: catalog.levels.length === 0 }}
    >
      <EntryModeTabs mode={mode} onChange={selectMode} />

      {isExcel ? (
        <ExcelUpload
          process="MAYOREOD_MASIVO"
          level={level}
          disabled={lockInput}
          instructions="Use las columnas Código Artículo y Descuento %."
          templateHref="/api/plantilla?proceso=MAYOREOD_MASIVO"
          errorCount={errorCount}
          errorMessage="Corrija y cargue nuevamente."
          onParsed={(parsed, name, s3Key) => {
            setRows(parsed);
            setFile({ name, s3Key });
            setSimulated(false);
            submission.setSent(false);
          }}
        />
      ) : (
        <BasePriceManualCapture
          level={level}
          levelName={levelName}
          levelOptions={levelOptions}
          articles={catalog.articles}
          criteria={criteria}
          factor={factor}
          factorError={factor !== "" && !conversion.valido ? conversion.causa : null}
          articleCount={articleCodes.length}
          acknowledged={acknowledged}
          simulationError={simulationError}
          disabled={lockInput}
          loading={catalog.loading}
          onLevelChange={setLevel}
          onCriterionChange={(classification, value) => setCriteria((current) => setCriterion(current, classification, value))}
          onFactorChange={setFactor}
          onAcknowledgedChange={setAcknowledged}
        />
      )}

      <RequestActions
        simulateLabel={isExcel ? "Precalcular impacto" : "Simular impacto"}
        canSimulate={!lockInput && fieldsComplete}
        onSimulate={() => void simulate()}
        canSave={fieldsComplete && simulated && !!rows?.length}
        canSubmit={canSubmit}
        destructive
        submission={submission}
        onSave={() => void submission.saveDraft(buildRequest())}
        onSubmit={() => canSubmit && void submission.submit(buildRequest())}
      />

      {rows && rows.length > 0 && (
        <SimulationResult exporting={exporting} onExport={() => void exportRows(() => rows)}>
          <TablaImpactoActualizacionMasiva filas={rows as FilaPrecio[]} />
        </SimulationResult>
      )}
    </ProcessFormLayout>
  );
}
