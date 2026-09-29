"use client";

import { useState } from "react";
import TablaImpactoActualizacionMasiva from "@/components/newComponents/TablaImpactoActualizacionMasiva";
import type { FilaPrecio, FilaResultado } from "@/lib/domain-types";
import type { SolicitudInput } from "../../../schemas/solicitud-schema";
import type { ProcessFormProps, UploadedFile } from "../../../types";
import { draftFile } from "../../../utils/draft-values";
import { useRequestSubmission } from "../../../hooks/useRequestSubmission";
import { useSimulationExport } from "../../../hooks/useSimulationExport";
import ExcelUpload from "../shared/ExcelUpload";
import ProcessFormLayout from "../shared/ProcessFormLayout";
import RequestActions from "../shared/RequestActions";
import SimulationResult from "../shared/SimulationResult";

const EMPTY_FILE: UploadedFile = { name: null, s3Key: null };

export default function BasePriceForm({ readOnly, consultOnly, draft, onSubmitted, onDiscardDraft }: ProcessFormProps) {
  const lockInput = readOnly && !consultOnly;

  const [rows, setRows] = useState<FilaResultado[] | null>(draft?.filas?.length ? draft.filas : null);
  const [simulated, setSimulated] = useState(Boolean(draft?.filas?.length));
  const [file, setFile] = useState<UploadedFile>(draftFile(draft));

  const { exporting, exportRows } = useSimulationExport("mayoreod_masivo", "Precio");
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
  const fieldsComplete = !!rows && rows.every((r) => r.validacion.valido);
  const canSubmit = simulated && fieldsComplete && !readOnly;

  function buildRequest(): SolicitudInput {
    return {
      proceso: "MAYOREOD_MASIVO",
      modalidad: "excel",
      parametros: {
        nivelPrecio: "MAYOREOD",
        listaBase: "MAYOREOD",
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
      catalogStatus={{ loading: false, error: null, noLevels: false }}
    >
      <ExcelUpload
        process="MAYOREOD_MASIVO"
        level="MAYOREOD"
        disabled={lockInput}
        instructions="Use las columnas Articulo y Precio."
        templateHref="/api/plantilla?proceso=MAYOREOD_MASIVO"
        errorCount={errorCount}
        errorMessage="Corrija y cargue nuevamente."
        onParsed={(parsed, name, s3Key) => {
          setRows(parsed);
          setFile({ name, s3Key });
          setSimulated(parsed.length > 0);
          submission.setSent(false);
        }}
      />

      <RequestActions
        simulateLabel="Precalcular impacto"
        canSimulate={false}
        onSimulate={() => undefined}
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
