"use client";

import { useState } from "react";
import { useToast } from "@/shared/components/layout/PortalProviders";
import type { Solicitud } from "@/lib/domain-types";
import { enviarBorrador, enviarSolicitud, guardarBorrador } from "../api/solicitudes-api";
import type { SolicitudInput } from "../schemas/solicitud-schema";

/**
 * Guardar borrador / enviar a aprobación. Si se está retomando un borrador,
 * "enviar" solo lo transiciona a PENDIENTE.
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
  const pushToast = useToast();
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sent, setSent] = useState(false);

  async function saveDraft(input: SolicitudInput) {
    setSavingDraft(true);
    const res = await guardarBorrador(input);
    setSavingDraft(false);
    if (!res.ok) {
      pushToast(res.error, "error");
      return;
    }
    pushToast(`Borrador ${res.data.solicitud.id} guardado. Puedes retomarlo desde "Mis solicitudes".`, "success");
    onSubmitted();
  }

  async function submit(input: SolicitudInput) {
    setSending(true);
    const res = draftId ? await enviarBorrador(draftId) : await enviarSolicitud(input);
    setSending(false);
    if (!res.ok) {
      pushToast(res.error, "error");
      return;
    }
    const id = draftId ?? ("solicitud" in res.data ? res.data.solicitud.id : "");
    setSent(true);
    setDraftId(null);
    pushToast(`Solicitud ${id} enviada a aprobación · Estado: Pendiente de aprobación`, "success");
    onSubmitted();
    setTimeout(() => {
      setSent(false);
      onReset();
    }, 1300);
  }

  return { draftId, sending, savingDraft, sent, setSent, saveDraft, submit };
}
