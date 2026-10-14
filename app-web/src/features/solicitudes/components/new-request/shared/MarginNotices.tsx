import { esFilaProcesable, esHallazgoDeNegocio, type FilaResultado } from "@/shared/types/domain-types";

/** Conteos de una carga: errores duros (se descartan), hallazgos de margen y procesables. */
export function contarFilas(rows: FilaResultado[] | null) {
  const filas = rows ?? [];
  const processable = filas.filter(esFilaProcesable).length;
  return {
    hardErrors: filas.length - processable,
    warnings: filas.filter(esHallazgoDeNegocio).length,
    processable,
  };
}

/**
 * Avisos de margen mínimo y filas descartadas. `blocked` = hay hallazgos en una lista con
 * VALIDAR_PRECIO_BAJO_MARGEN_MIN activo (no se puede enviar).
 */
export default function MarginNotices({
  rows,
  blocked,
  listLabel,
}: {
  rows: FilaResultado[] | null;
  blocked: boolean;
  listLabel: string;
}) {
  const { hardErrors, warnings, processable } = contarFilas(rows);
  if (warnings === 0 && hardErrors === 0) return null;
  return (
    <div className="space-y-2">
      {warnings > 0 && (
        blocked ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
            <span className="text-red-500 mt-0.5" aria-hidden="true">✕</span>
            <span>
              <strong>{warnings} fila(s) por debajo del margen mínimo</strong>: la lista {listLabel} tiene
              activada la validación de precio bajo margen mínimo.{" "}
              <strong>No se puede enviar la solicitud</strong> mientras contenga estas filas.
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
            <span className="text-amber-500 mt-0.5">⚠</span>
            <span>
              <strong>{warnings} fila(s) por debajo del margen mínimo</strong>: se incluirán en la solicitud.
              El aprobador verá la advertencia antes de autorizar.
            </span>
          </div>
        )
      )}
      {hardErrors > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <span className="text-red-500 mt-0.5">✕</span>
          <span>
            <strong>{hardErrors} fila(s) con error</strong> serán ignoradas
            (código inválido, valor fuera de rango u otro error de formato).
            {processable > 0
              ? <> Se procesarán únicamente los <strong>{processable} registros procesables</strong>.</>
              : <> No hay registros procesables.</>}
          </span>
        </div>
      )}
    </div>
  );
}
