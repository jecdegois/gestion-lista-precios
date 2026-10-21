"use client";

import { useState } from "react";
import TablaImpactoActualizacionMasiva from "@/features/solicitudes/components/tables/TablaImpactoActualizacionMasiva";
import type { FilaPrecio, FilaResultado } from "@/shared/types/domain-types";
import type { SolicitudInput } from "../../../schemas/solicitud-schema";
import type { ProcessFormProps, UploadedFile } from "../../../types";
import { draftFile } from "../../../utils/draft-values";
import { useRequestSubmission } from "../../../hooks/useRequestSubmission";
import { useSimulationExport } from "../../../hooks/useSimulationExport";
import ExcelUpload from "../shared/ExcelUpload";
import ProcessFormLayout from "../shared/ProcessFormLayout";
import RequestActions from "../shared/RequestActions";
import SimulationResult from "../shared/SimulationResult";
import MarginNotices, { contarFilas } from "../shared/MarginNotices";

const EMPTY_FILE: UploadedFile = { name: null, s3Key: null };
const LISTA_MAYOREOD = "MAYOREOD";

export default function BasePriceForm({ readOnly, consultOnly, draft, onSubmitted, onDiscardDraft }: ProcessFormProps) {
  const lockInput = readOnly && !consultOnly;

  const [rows, setRows] = useState<FilaResultado[] | null>(draft?.filas?.length ? draft.filas : null);
  const [simulated, setSimulated] = useState(Boolean(draft?.filas?.length));
  const [file, setFile] = useState<UploadedFile>(draftFile(draft));

  const { exporting, exportRows } = useSimulationExport("mayoreod_masivo", "Precio", "precioBase");
  const submission = useRequestSubmission({
    draft,
    onSubmitted,
    onReset: () => {
      setRows(null);
      setSimulated(false);
      setFile(EMPTY_FILE);
    },
  });

  const { processable: processableCount } = contarFilas(rows);
  const canSubmit = simulated && processableCount > 0 && !readOnly;

  function buildRequest(): SolicitudInput {
    return {
      proceso: "MAYOREOD_MASIVO",
      modalidad: "excel",
      parametros: {
        nivelPrecio: LISTA_MAYOREOD,
        listaBase: LISTA_MAYOREOD,
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
        level={LISTA_MAYOREOD}
        disabled={lockInput}
        instructions="Use las columnas Articulo y Precio."
        templateHref="/api/plantilla?proceso=MAYOREOD_MASIVO"
        errorCount={0}
        errorMessage=""
        onParsed={(parsed, name, s3Key) => {
          setRows(parsed);
          setFile({ name, s3Key });
          setSimulated(parsed.length > 0);
          submission.setSent(false);
        }}
        fileName={file.name}
        onClear={rows ? () => {
          setRows(null);
          setFile(EMPTY_FILE);
          setSimulated(false);
        } : undefined}
      />

      <RequestActions
        simulateLabel="Precalcular impacto"
        canSimulate={false}
        onSimulate={() => undefined}
        canSave={processableCount > 0 && simulated && !!rows?.length}
        canSubmit={canSubmit}
        destructive
        submission={submission}
        onSave={() => void submission.saveDraft(buildRequest())}
        onSubmit={() => canSubmit && void submission.submit(buildRequest())}
      />

      <MarginNotices rows={rows} />

      {rows && rows.length > 0 && (
        <SimulationResult exporting={exporting} onExport={() => void exportRows(() => rows)}>
          <TablaImpactoActualizacionMasiva filas={rows as FilaPrecio[]} ocultarDatosPorCorregir />
        </SimulationResult>
      )}
    </ProcessFormLayout>
  );
}
