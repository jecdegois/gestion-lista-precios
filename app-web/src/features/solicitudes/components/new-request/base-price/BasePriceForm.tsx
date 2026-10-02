"use client";

import { useState } from "react";
import TablaImpactoActualizacionMasiva from "@/features/solicitudes/components/tables/TablaImpactoActualizacionMasiva";
import type { FilaPrecio, FilaResultado } from "@/shared/types/domain-types";
import type { SolicitudInput } from "../../../schemas/solicitud-schema";
import type { ProcessFormProps, UploadedFile } from "../../../types";
import { draftFile } from "../../../utils/draft-values";
import { useRequestSubmission } from "../../../hooks/useRequestSubmission";
import { useMarginMinFlags } from "../../../hooks/useMarginMinFlags";
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

  // GESTION_LISTAS_PRECIOS.VALIDAR_PRECIO_BAJO_MARGEN_MIN de MAYOREOD: activo + hallazgos → no se envía.
  const validarPrecioBajoMargenMin = useMarginMinFlags()(LISTA_MAYOREOD);

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

  const { warnings: warningCount, processable: processableCount } = contarFilas(rows);
  const bloqueadoPorMargenMin = validarPrecioBajoMargenMin && warningCount > 0;
  const canSubmit = simulated && processableCount > 0 && !readOnly && !bloqueadoPorMargenMin;

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
      {validarPrecioBajoMargenMin && (
        // Aviso preventivo: se muestra al abrir la pestaña, antes de cargar el archivo.
        <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-start gap-2">
          <span className="mt-0.5" aria-hidden="true">🚩</span>
          <span>
            <strong>Validación de margen mínimo activa</strong> para la lista MAYOREOD.{" "}
            Si el archivo contiene artículos con precio por debajo del margen mínimo,
            la solicitud <strong>no se podrá enviar</strong> hasta corregirlos.
          </span>
        </div>
      )}

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

      <MarginNotices rows={rows} blocked={bloqueadoPorMargenMin} listLabel={LISTA_MAYOREOD} />

      {rows && rows.length > 0 && (
        <SimulationResult exporting={exporting} onExport={() => void exportRows(() => rows)}>
          <TablaImpactoActualizacionMasiva filas={rows as FilaPrecio[]} ocultarDatosPorCorregir />
        </SimulationResult>
      )}
    </ProcessFormLayout>
  );
}
