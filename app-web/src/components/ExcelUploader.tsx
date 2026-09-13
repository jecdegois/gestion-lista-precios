"use client";

import { useRef, useState } from "react";
import Icon from "./Icon";
import { parsearExcel } from "@/app/actions";
import type { FilaResultado, ProcesoKey } from "@/lib/domain-types";

export default function ExcelUploader({
  disabled,
  procesoKey,
  compania,
  nivelPrecio,
  onParsed,
  onError,
}: {
  disabled?: boolean;
  procesoKey: ProcesoKey;
  compania: string;
  nivelPrecio?: string;
  onParsed: (filas: FilaResultado[], nombre: string, s3Key: string) => void;
  onError: (msg: string) => void;
}) {
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [s3Key, setS3Key] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(file: File) {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      onError("Formato no soportado. Use un archivo .xlsx.");
      return;
    }
    setLoading(true);
    setFileName(file.name);
    const fd = new FormData();
    fd.append("proceso", procesoKey);
    fd.append("compania", compania);
    if (nivelPrecio) fd.append("nivelPrecio", nivelPrecio);
    fd.append("archivo", file);
    try {
      const res = await parsearExcel(fd);
      if (!res.ok) {
        onError(res.error ?? "No fue posible leer el archivo.");
      } else {
        setS3Key(res.archivoS3Key ?? null);
        onParsed(res.filas, res.archivoNombre ?? file.name, res.archivoS3Key ?? "");
      }
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div
        className={"dropzone" + (drag ? " drag" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (disabled) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void enviar(file);
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
            if (file) void enviar(file);
          }}
        />
      </div>
    </div>
  );
}
