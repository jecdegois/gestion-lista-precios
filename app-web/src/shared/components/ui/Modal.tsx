"use client";

import { useEffect } from "react";
import clsx from "clsx";
import Icon from "@/shared/components/ui/Icon";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Botones del pie; si se omite no se dibuja el pie. */
  footer?: React.ReactNode;
  /** Con `onSubmit` el contenido es un `<form>` y el pie puede usar botones `type="submit"`. */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  /** false: sin ✕, sin cierre al hacer clic fuera ni con Esc (el pie decide cómo salir). */
  dismissible?: boolean;
  className?: string;
};

/** Diálogo modal del portal: overlay, encabezado con título, cuerpo y pie. */
export default function Modal({ title, onClose, children, footer, onSubmit, dismissible = true, className }: ModalProps) {
  useEffect(() => {
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissible, onClose]);

  const box = { className: clsx("modal-box !max-w-xl", className), role: "dialog", "aria-modal": true, "aria-labelledby": "modal-title" } as const;
  const content = (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
        <h2 id="modal-title" className="text-base font-semibold text-zinc-900">{title}</h2>
        {dismissible && (
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer && <div className="flex justify-end gap-2 px-6 py-4 border-t border-zinc-200">{footer}</div>}
    </>
  );

  return (
    <div className="modal-overlay" onClick={(e) => dismissible && e.target === e.currentTarget && onClose()}>
      {onSubmit ? <form {...box} onSubmit={onSubmit}>{content}</form> : <div {...box}>{content}</div>}
    </div>
  );
}
