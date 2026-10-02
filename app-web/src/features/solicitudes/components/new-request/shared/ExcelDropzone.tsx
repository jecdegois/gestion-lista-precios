"use client";

import { useRef, useState } from "react";
import Icon from "@/shared/components/ui/Icon";
import type { FilaResultado, ProcesoKey } from "@/shared/types/domain-types";
import { parsearExcel } from "../../../api/solicitudes-api";

/** Zona de arrastre/selección de la plantilla .xlsx; la parsea en el servidor. */
export default function ExcelDropzone({
  disabled,
  process,
  level,
  onParsed,
  onError,
  onClear,
  initialFileName,
}: {
  disabled?: boolean;
  process: ProcesoKey;
  level?: string;
  onParsed: (rows: FilaResultado[], fileName: string, s3Key: string) => void;
  onError: (message: string) => void;
  /** Solo se pasa cuando hay un archivo cargado; muestra el botón "Eliminar archivo". */
  onClear?: () => void;
  initialFileName?: string | null;
}) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(initialFileName ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      onError("Formato no soportado. Use un archivo .xlsx.");
      return;
    }
    setLoading(true);
    setFileName(file.name);
    const res = await parsearExcel({ proceso: process, nivelPrecio: level, archivo: file });
    setLoading(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    onParsed(res.data.filas, res.data.archivoNombre ?? file.name, res.data.archivoS3Key ?? "");
  }

  return (
    <div>
      <div
        className={"dropzone" + (dragging ? " drag" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <Icon name="upload" className="w-6 h-6 mx-auto text-zinc-400 mb-2" />
        <p className="text-sm font-medium text-zinc-700">Arrastre el archivo .xlsx o haga clic para seleccionar</p>
        {loading && <p className="text-xs text-indigo-600 mt-1">Procesando…</p>}
        {fileName && !loading && (
          <p className="text-xs text-zinc-600 mt-2 mono inline-flex items-center gap-1.5">
            {fileName}
            {onClear && !disabled && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-zinc-500 hover:bg-zinc-200 hover:text-red-600"
                onClick={(e) => {
                  e.stopPropagation(); // no abrir el selector de archivos
                  onClear();
                }}
              >
                <Icon name="x" className="w-3.5 h-3.5" /> Eliminar archivo
              </button>
            )}
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
    </div>
  );
}
