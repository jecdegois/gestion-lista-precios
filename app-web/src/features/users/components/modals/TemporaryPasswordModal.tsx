"use client";

import { useState } from "react";
import Modal from "@/shared/components/ui/Modal";

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

  // Sin cierre por ✕, clic fuera ni Esc: el admin confirma con «Listo» que guardó la contraseña.
  return (
    <Modal
      title="Contraseña temporal"
      onClose={onClose}
      dismissible={false}
      className="!max-w-md"
      footer={<button type="button" className="btn btn-default" onClick={onClose}>Listo</button>}
    >
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
    </Modal>
  );
}
