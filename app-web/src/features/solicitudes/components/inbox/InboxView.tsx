"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RevisionModal from "@/components/RevisionModal";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import { useInbox } from "../../hooks/useInbox";
import { resumeDraftRoute } from "../../routes";
import InboxTable from "./InboxTable";

/** Bandeja de aprobación: solicitudes de la compañía, detalle y decisiones del aprobador. */
export default function InboxView({ readOnly }: { readOnly: boolean }) {
  const user = useCurrentUser();
  const router = useRouter();
  const inbox = useInbox(readOnly);
  const [modalId, setModalId] = useState<string | null>(null);
  const isApprover = user.rol === "APROBADOR";
  const isAuditor = user.rol === "AUDITOR";

  function open(id: string) {
    setModalId(id);
    const request = inbox.requests.find((s) => s.id === id);
    // Abrir una solicitud pendiente de otro usuario registra la revisión del aprobador.
    if (request?.estado === "PENDIENTE" && isApprover && !readOnly && request.solicitanteEmail !== user.email) {
      void inbox.markReviewed(id);
    }
  }

  function resume(id: string) {
    const request = inbox.requests.find((s) => s.id === id);
    if (request) router.push(resumeDraftRoute(request.proceso, id));
  }

  const modalRequest = modalId ? inbox.requests.find((s) => s.id === modalId) : undefined;

  return (
    <>
      <InboxTable requests={inbox.requests} currentUser={user} onOpen={open} />
      {modalRequest && (
        <RevisionModal
          solicitud={modalRequest}
          currentUser={user}
          readOnly={readOnly}
          onClose={() => setModalId(null)}
          onAprobar={(id) => void inbox.approve(id)}
          onRechazar={(id, reason) => void inbox.reject(id, reason)}
          onCancelar={(id, reason) => void inbox.requestCancellation(id, reason)}
          onDecidirCancelacion={(id, approved) => void inbox.decideCancellation(id, approved)}
          onRetomar={isAuditor ? undefined : resume}
        />
      )}
    </>
  );
}
