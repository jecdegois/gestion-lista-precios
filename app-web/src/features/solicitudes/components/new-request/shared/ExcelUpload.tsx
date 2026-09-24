"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import type { FilaResultado, ProcesoKey } from "@/lib/domain-types";
import ExcelDropzone from "./ExcelDropzone";

/** Descarga de plantilla + carga del archivo + resumen de filas inválidas. */
export default function ExcelUpload({
  process,
  level,
  disabled,
  instructions,
  templateHref,
  errorCount,
  errorMessage,
  onParsed,
}: {
  process: ProcesoKey;
  level?: string;
  disabled: boolean;
  instructions?: string;
  templateHref: string;
  errorCount: number;
  errorMessage: string;
  onParsed: (rows: FilaResultado[], fileName: string, s3Key: string) => void;
}) {
  const [uploadError, setUploadError] = useState<string | null>(null);

  return (
    <div className="space-y-4 mb-4">
      <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        {instructions && <p className="text-xs text-zinc-600">{instructions}</p>}
        <a href={templateHref} className="btn btn-outline">
          <Icon name="download" className="w-3.5 h-3.5" /> Descargar plantilla
        </a>
      </div>
      <ExcelDropzone
        disabled={disabled}
        process={process}
        level={level}
        onParsed={(rows, fileName, s3Key) => {
          setUploadError(null);
          onParsed(rows, fileName, s3Key);
        }}
        onError={setUploadError}
      />
      {uploadError && <p className="text-[11px] text-red-600">{uploadError}</p>}
      {errorCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          La carga contiene {errorCount} fila(s) inválida(s). {errorMessage}
        </div>
      )}
    </div>
  );
}
