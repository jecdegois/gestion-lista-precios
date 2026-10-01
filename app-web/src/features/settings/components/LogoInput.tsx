"use client";

import { useEffect, useRef, useState } from "react";
import type { LogoChange } from "../hooks/useCompanySettings";
import { LOGO_ACCEPT, LOGO_MAX_BYTES } from "../utils/company-logo";

/**
 * Selector del logo con vista previa. No sube nada: informa el cambio (`File` / `null`)
 * y el modal lo guarda junto con el resto. La API vuelve a validar tipo y tamaño.
 */
export default function LogoInput({
  currentUrl,
  value,
  onChange,
  onError,
}: {
  currentUrl: string | null;
  value: LogoChange;
  onChange: (logo: LogoChange) => void;
  onError: (message: string | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!(value instanceof File)) return setPreview(null);
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const shown = value === null ? null : (preview ?? currentUrl);

  function pick(file: File | undefined) {
    if (!file) return;
    if (!LOGO_ACCEPT.split(",").includes(file.type)) return onError("Use una imagen PNG, JPEG o WebP");
    if (file.size > LOGO_MAX_BYTES) return onError(`El logo no puede superar ${LOGO_MAX_BYTES / 1024} KB`);
    onError(undefined);
    onChange(file);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="w-14 h-14 flex-none rounded-lg border border-zinc-200 bg-white flex items-center justify-center overflow-hidden">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: y URL de la API, fuera de next/image
          <img src={shown} alt="Logo de la compañía" className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-[10px] text-zinc-400">Sin logo</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={LOGO_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button type="button" className="btn btn-outline" onClick={() => inputRef.current?.click()}>
        {shown ? "Cambiar" : "Cargar logo"}
      </button>
      {shown && (
        <button type="button" className="btn btn-ghost" onClick={() => onChange(currentUrl ? null : undefined)}>
          Quitar
        </button>
      )}
    </div>
  );
}
