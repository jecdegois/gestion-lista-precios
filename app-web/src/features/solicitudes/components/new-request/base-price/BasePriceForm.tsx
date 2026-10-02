"use client";

import { useEffect, useState } from "react";
import TablaImpactoActualizacionMasiva from "@/features/solicitudes/components/tables/TablaImpactoActualizacionMasiva";
import { esHallazgoDeNegocio } from "@/features/solicitudes/components/tables/Tablas";
import type { FilaPrecio, FilaResultado } from "@/shared/types/domain-types";
import type { GestionGlobalLista } from "@/shared/types/models";
import type { SolicitudInput } from "../../../schemas/solicitud-schema";
import type { ProcessFormProps, UploadedFile } from "../../../types";
import { draftFile } from "../../../utils/draft-values";
import { useRequestSubmission } from "../../../hooks/useRequestSubmission";
import { getCatalogoGestionGlobal } from "../../../api/solicitudes-api";
import { useSimulationExport } from "../../../hooks/useSimulationExport";
import ExcelUpload from "../shared/ExcelUpload";
import ProcessFormLayout from "../shared/ProcessFormLayout";
import RequestActions from "../shared/RequestActions";
import SimulationResult from "../shared/SimulationResult";

const EMPTY_FILE: UploadedFile = { name: null, s3Key: null };
const LISTA_MAYOREOD = "MAYOREOD";

export default function BasePriceForm({ readOnly, consultOnly, draft, onSubmitted, onDiscardDraft }: ProcessFormProps) {
  const lockInput = readOnly && !consultOnly;

  const [rows, setRows] = useState<FilaResultado[] | null>(draft?.filas?.length ? draft.filas : null);
  const [simulated, setSimulated] = useState(Boolean(draft?.filas?.length));
  const [file, setFile] = useState<UploadedFile>(draftFile(draft));

  // Flag GESTION_LISTAS_PRECIOS.VALIDAR_PRECIO_BAJO_MARGEN_MIN para MAYOREOD.
  // Si está activo, no se permite enviar la solicitud con hallazgos de margen.
  // Siempre se consulta el valor vigente (el servidor también lo re-valida al enviar).
  const [validarPrecioBajoMargenMin, setValidarPrecioBajoMargenMin] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    // La API responde { ok, data: { listas, niveles } } — usar el cliente tipado.
    void getCatalogoGestionGlobal()
      .then((res) => {
        if (cancelled || !res.ok) return;
        const listas: GestionGlobalLista[] = res.data?.listas ?? [];
        const config = listas.find((l) => l.codigo.trim().toUpperCase() === LISTA_MAYOREOD);
        if (config) setValidarPrecioBajoMargenMin(config.validarPrecioBajoMargenMin);
      })
      .catch(() => undefined); // flag queda en false si la consulta falla — comportamiento seguro
    return () => { cancelled = true; };
  }, []);

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

  // Errores duros: inválidas que NO son hallazgos de margen → se descartan al enviar
  const hardErrorCount = rows ? rows.filter((r) => !r.validacion.valido && !esHallazgoDeNegocio(r)).length : 0;
  // Advertencias de margen: inválidas con ALERTA_MARGEN → se incluyen en la solicitud
  const warningCount = rows ? rows.filter((r) => esHallazgoDeNegocio(r)).length : 0;
  // Válidas + advertencias de margen son procesables
  const processableCount = rows ? rows.filter((r) => r.validacion.valido || esHallazgoDeNegocio(r)).length : 0;
  const hasPartialErrors = hardErrorCount > 0 && processableCount > 0;
  // VALIDAR_PRECIO_BAJO_MARGEN_MIN activo + hallazgos de margen → no se permite enviar.
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

      {(warningCount > 0 || hasPartialErrors) && (
        <div className="space-y-2">
          {warningCount > 0 && (
            bloqueadoPorMargenMin ? (
              // VALIDAR_PRECIO_BAJO_MARGEN_MIN ON: no se permite enviar la solicitud
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
                <span className="text-red-500 mt-0.5" aria-hidden="true">✕</span>
                <span>
                  <strong>{warningCount} fila(s) por debajo del margen mínimo</strong>: la lista MAYOREOD
                  tiene activada la validación de precio bajo margen mínimo.{" "}
                  <strong>No se puede enviar la solicitud</strong> mientras contenga estas filas.
                  Corrija los precios en el archivo y vuelva a cargarlo.
                </span>
              </div>
            ) : (
              // Flag OFF: advertencia informativa, el aprobador decide
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">⚠</span>
                <span>
                  <strong>{warningCount} fila(s) por debajo del margen mínimo</strong>: se incluirán en la solicitud.
                  El aprobador verá la advertencia antes de autorizar.
                </span>
              </div>
            )
          )}
          {hasPartialErrors && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
              <span className="text-red-500 mt-0.5">✕</span>
              <span>
                <strong>{hardErrorCount} fila(s) con error</strong> serán ignoradas
                (precio cero, código inválido u otro error de formato).
                Se procesarán únicamente los <strong>{processableCount} registros procesables</strong>.
              </span>
            </div>
          )}
        </div>
      )}

      {rows && rows.length > 0 && (
        <SimulationResult exporting={exporting} onExport={() => void exportRows(() => rows)}>
          <TablaImpactoActualizacionMasiva filas={rows as FilaPrecio[]} ocultarDatosPorCorregir />
        </SimulationResult>
      )}
    </ProcessFormLayout>
  );
}
