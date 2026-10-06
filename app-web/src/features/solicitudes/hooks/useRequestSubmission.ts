"use client";

import { useState } from "react";
import { notify } from "@/shared/notifications/notify";
import type { Solicitud } from "@/shared/types/domain-types";
import { enviarSolicitud, guardarBorrador } from "../api/solicitudes-api";
import type { SolicitudInput } from "../schemas/solicitud-schema";

/**
 * Guardar borrador / enviar a aprobación. Si se está retomando un borrador, se
 * envía lo editado con `borradorId` y el servidor actualiza ese mismo borrador.
 */
export function useRequestSubmission({
  draft,
  onSubmitted,
  onReset,
}: {
  draft?: Solicitud;
  onSubmitted: () => void;
  onReset: () => void;
}) {
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sent, setSent] = useState(false);

  async function saveDraft(input: SolicitudInput) {
    setSavingDraft(true);
    const res = await guardarBorrador({ ...input, borradorId: draftId });
    setSavingDraft(false);
    if (!res.ok) {
      console.error("[saveDraft] Error al guardar borrador:", res.error);
      notify.error(res.error);
      return;
    }
    notify.success(`Borrador ${res.data.solicitud.id} guardado. Puedes retomarlo desde "Mis solicitudes".`);
    onSubmitted();
  }

  async function submit(input: SolicitudInput) {
    setSending(true);
    const res = await enviarSolicitud({ ...input, borradorId: draftId });
    setSending(false);
    if (!res.ok) {
      console.error("[submit] Error al enviar solicitud:", res.error);
      notify.error(res.error);
      return;
    }
    const id = res.data.solicitud.id;
    setSent(true);
    setDraftId(null);
    notify.success(`Solicitud ${id} enviada a aprobación · Estado: Pendiente de aprobación`);
    onSubmitted();
    setTimeout(() => {
      setSent(false);
      onReset();
    }, 1300);
  }

  return { draftId, sending, savingDraft, sent, setSent, saveDraft, submit };
}
