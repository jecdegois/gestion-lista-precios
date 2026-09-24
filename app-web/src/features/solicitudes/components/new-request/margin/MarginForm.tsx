"use client";

import { useState } from "react";
import TablaImpactoMargen from "@/components/newComponents/TablaImpactoMargen";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import { calcularVariacion } from "@/lib/preview";
import type { FilaResultado } from "@/lib/domain-types";
import type { SolicitudInput } from "../../../schemas/solicitud-schema";
import type { ProcessFormProps, UploadedFile } from "../../../types";
import { draftFile, draftValues, EMPTY_FILE } from "../../../utils/draft-values";
import { useDefaultLevel, useRequestCatalog } from "../../../hooks/useRequestCatalog";
import { useRequestSubmission } from "../../../hooks/useRequestSubmission";
import { useSimulationExport } from "../../../hooks/useSimulationExport";
import ExcelUpload from "../shared/ExcelUpload";
import ProcessFormLayout from "../shared/ProcessFormLayout";
import RequestActions from "../shared/RequestActions";
import SimulationResult from "../shared/SimulationResult";
import MarginInstructions from "./MarginInstructions";

// El margen se consulta contra la lista base.
const BASE_LIST = "MAYOREOD";

export default function MarginForm({ readOnly, consultOnly, draft, onSubmitted, onDiscardDraft }: ProcessFormProps) {
  const company = useCurrentUser().compania ?? "";
  const lockInput = readOnly && !consultOnly;

  const [level, setLevel] = useState(draftValues(draft, "DISMINUCION").level);
  const [rows, setRows] = useState<FilaResultado[] | null>(draft?.filas?.length ? draft.filas : null);
  const [simulated, setSimulated] = useState(Boolean(draft?.filas?.length));
  const [file, setFile] = useState<UploadedFile>(draftFile(draft));

  const catalog = useRequestCatalog(level, false);
  useDefaultLevel(level, catalog.levels, BASE_LIST, setLevel);
  const { exporting, exportRows } = useSimulationExport("margen_utilidad_masivo", "Descuento %");
  const submission = useRequestSubmission({
    draft,
    onSubmitted,
    onReset: () => {
      setRows(null);
      setSimulated(false);
      setFile(EMPTY_FILE);
    },
  });

  const errorCount = rows ? rows.filter((r) => !r.validacion.valido).length : 0;
  const fieldsComplete = !!rows && rows.every((r) => r.validacion.valido) && !!company;
  const canSubmit = simulated && fieldsComplete && !readOnly;

  function buildRequest(): SolicitudInput {
    return {
      proceso: "MARGEN_UTILIDAD_MASIVO",
      modalidad: "manual",
      parametros: {
        nivel: level,
        factor: "",
        multiplicador: calcularVariacion("DISMINUCION", "").factor,
        tipoVariacion: "DISMINUCION",
        variacionPorcentaje: "",
        nivelPrecio: level || undefined,
      },
      filas: (rows ?? []) as unknown as SolicitudInput["filas"],
      archivoNombre: file.name,
      archivoS3Key: file.s3Key,
    };
  }

  return (
    <ProcessFormLayout
      process="MARGEN_UTILIDAD_MASIVO"
      draftId={submission.draftId}
      onDiscardDraft={onDiscardDraft}
      catalogStatus={{ loading: catalog.loading, error: catalog.error, noLevels: catalog.levels.length === 0 }}
    >
      <MarginInstructions />
      <ExcelUpload
        process="MARGEN_UTILIDAD_MASIVO"
        level={level}
        disabled={lockInput}
        templateHref="/api/plantilla"
        errorCount={errorCount}
        errorMessage="Corrija los porcentajes y cargue nuevamente."
        onParsed={(parsed, name, s3Key) => {
          setRows(parsed);
          setFile({ name, s3Key });
          setSimulated(false);
          submission.setSent(false);
        }}
      />

      <RequestActions
        simulateLabel="Precalcular impacto"
        canSimulate={!lockInput && fieldsComplete}
        onSimulate={() => setSimulated(true)}
        canSave={fieldsComplete && simulated}
        canSubmit={canSubmit}
        submission={submission}
        onSave={() => void submission.saveDraft(buildRequest())}
        onSubmit={() => canSubmit && void submission.submit(buildRequest())}
      />

      {rows && rows.length > 0 && (
        <SimulationResult exporting={exporting} onExport={() => void exportRows(() => rows)}>
          <TablaImpactoMargen filas={rows as Parameters<typeof TablaImpactoMargen>[0]["filas"]} />
        </SimulationResult>
      )}
    </ProcessFormLayout>
  );
}
