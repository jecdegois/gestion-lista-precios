"use client";

import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import type { FilaResultado, ProcesoKey } from "@/lib/domain-types";
import { parsearExcel } from "../../../api/solicitudes-api";

/** Zona de arrastre/selección de la plantilla .xlsx; la parsea en el servidor. */
export default function ExcelDropzone({
  disabled,
  process,
  level,
  onParsed,
  onError,
}: {
  disabled?: boolean;
  process: ProcesoKey;
  level?: string;
  onParsed: (rows: FilaResultado[], fileName: string, s3Key: string) => void;
  onError: (message: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [s3Key, setS3Key] = useState<string | null>(null);
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
    setS3Key(res.data.archivoS3Key ?? null);
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
        {fileName && !loading && <p className="text-xs text-zinc-600 mt-2 mono">{fileName}</p>}
        {s3Key && <p className="text-[10px] text-zinc-400 mt-1 mono">s3://{s3Key}</p>}
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
