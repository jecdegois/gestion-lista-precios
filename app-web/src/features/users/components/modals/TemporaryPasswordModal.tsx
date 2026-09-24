"use client";

import { useState } from "react";

/** Muestra la contraseña temporal una sola vez; no se vuelve a poder consultar. */
export default function TemporaryPasswordModal({
  email,
  password,
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box !max-w-md p-6" role="dialog" aria-modal="true" aria-labelledby="temporary-password-title">
        <h2 id="temporary-password-title" className="text-base font-semibold text-zinc-900 mb-1">Contraseña temporal</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Entréguela a <span className="mono">{email}</span> por un canal seguro. No se volverá a mostrar y deberá
          cambiarla al ingresar.
        </p>
        <div className="flex gap-2">
          <input className="input mono" readOnly value={password} onFocus={(e) => e.target.select()} aria-label="Contraseña temporal" />
          <button type="button" className="btn btn-outline" onClick={() => void copy()}>
            {copied ? "Copiada" : "Copiar"}
          </button>
        </div>
        <div className="flex justify-end mt-6">
          <button type="button" className="btn btn-default" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}
