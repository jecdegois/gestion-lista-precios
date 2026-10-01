"use client";

import { useState } from "react";
import Modal from "@/shared/components/ui/Modal";
import type { CompanyListItem } from "../types";

/** Confirmación de la baja de una compañía; `onConfirm` devuelve si se eliminó. */
export default function DeleteCompanyModal({
  company,
  onClose,
  onConfirm,
}: {
  company: CompanyListItem;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    if (await onConfirm()) onClose();
    else setDeleting(false);
  }

  return (
    <Modal
      title="Eliminar compañía"
      onClose={onClose}
      dismissible={!deleting}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={deleting}>
            Cancelar
          </button>
          <button type="button" className="btn btn-destructive" onClick={handleConfirm} disabled={deleting}>
            {deleting ? "Eliminando..." : "Eliminar"}
          </button>
        </>
      }
    >
      <p className="text-sm text-zinc-700">
        ¿Eliminar <b>{company.name}</b> ({company.code})? Dejará de aparecer en el portal y los usuarios asignados
        perderán el acceso a ella.
      </p>
      <p className="text-xs text-zinc-500 mt-2">
        El historial se conserva. Si vuelve a crear una compañía con el código {company.code}, se reactiva.
      </p>
    </Modal>
  );
}
