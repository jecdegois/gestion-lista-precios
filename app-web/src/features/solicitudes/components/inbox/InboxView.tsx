"use client";

import { useRouter } from "next/navigation";
import RevisionModal from "@/components/RevisionModal";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import { useInbox } from "../../hooks/useInbox";
import { resumeDraftRoute } from "../../routes";
import InboxTable from "./InboxTable";

/** Bandeja de aprobación: solicitudes paginadas (cabeceras) + detalle lazy al abrir el modal. */
export default function InboxView({ readOnly }: { readOnly: boolean }) {
  const user = useCurrentUser();
  const router = useRouter();
  const inbox = useInbox(readOnly);
  const isApprover = user.rol === "APROBADOR";
  const isAuditor = user.rol === "AUDITOR";

  async function open(id: string) {
    await inbox.openWithDetail(id);
    // Registrar revisión del aprobador sobre solicitudes PENDIENTE ajenas
    const cabecera = inbox.requests.find((s) => s.id === id);
    if (
      cabecera?.estado === "PENDIENTE" &&
      isApprover &&
      !readOnly &&
      cabecera.solicitanteEmail !== user.email
    ) {
      void inbox.markReviewed(id);
    }
  }

  function resume(id: string) {
    const request = inbox.requests.find((s) => s.id === id);
    if (request) router.push(resumeDraftRoute(request.proceso, id));
  }

  return (
    <>
      <InboxTable
        requests={inbox.requests}
        total={inbox.total}
        hasMore={inbox.hasMore}
        loadingMore={inbox.loadingMore}
        currentUser={user}
        onOpen={(id) => void open(id)}
        onRefresh={inbox.refresh}
        onLoadMore={inbox.loadMore}
        refreshing={inbox.refreshing}
      />

      {inbox.modalRequest && (
        <RevisionModal
          solicitud={inbox.modalRequest}
          currentUser={user}
          readOnly={readOnly}
          onClose={inbox.closeModal}
          onAprobar={(id) => void inbox.approve(id)}
          onReintentar={(id) => void inbox.retry(id)}
          onRechazar={(id, reason) => void inbox.reject(id, reason)}
          onCancelar={(id, reason) => void inbox.requestCancellation(id, reason)}
          onDecidirCancelacion={(id, approved) => void inbox.decideCancellation(id, approved)}
          onRetomar={isAuditor ? undefined : resume}
          loadingDetail={inbox.loadingDetail}
        />
      )}
    </>
  );
}
