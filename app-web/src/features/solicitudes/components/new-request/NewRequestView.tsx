"use client";

import { useState, type ComponentType } from "react";
import MisSolicitudes from "@/components/MisSolicitudes";
import RevisionModal from "@/components/RevisionModal";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import type { ProcesoKey } from "@/lib/domain-types";
import { useMyRequests } from "../../hooks/useMyRequests";
import type { ProcessFormProps } from "../../types";
import BasePriceForm from "./base-price/BasePriceForm";
import DiscountForm from "./discount/DiscountForm";
import GlobalManagementForm from "./global-management/GlobalManagementForm";
import MarginForm from "./margin/MarginForm";

const FORMS: Record<ProcesoKey, ComponentType<ProcessFormProps>> = {
  FACTOR_PRECIO: GlobalManagementForm,
  MAYOREOD_MASIVO: BasePriceForm,
  DESCUENTO_LISTA_PRECIO: DiscountForm,
  MARGEN_UTILIDAD_MASIVO: MarginForm,
};

const noop = () => {};

/** Pestaña de Nueva Solicitud: formulario del proceso + "Mis solicitudes enviadas" del mismo tipo. */
export default function NewRequestView({
  process,
  readOnly,
  consultOnly,
}: {
  process: ProcesoKey;
  readOnly: boolean;
  consultOnly: boolean;
}) {
  const Form = FORMS[process];
  const user = useCurrentUser();
  const mine = useMyRequests(process, readOnly);
  const [modalId, setModalId] = useState<string | null>(null);
  // El auditor solo consulta: sin retomar, enviar ni cancelar.
  const canAct = user.rol !== "AUDITOR";

  function resumeDraft(id: string) {
    mine.setDraft(mine.requests.find((s) => s.id === id));
    setModalId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const actions = canAct
    ? { onCancelar: mine.requestCancellation, onEnviarBorrador: mine.submitDraft, onRetomar: resumeDraft }
    : { onCancelar: undefined, onEnviarBorrador: undefined, onRetomar: undefined };
  const modalRequest = modalId ? mine.requests.find((s) => s.id === modalId) : undefined;

  return (
    <>
      <Form
        key={mine.draft?.id ?? "new"}
        readOnly={readOnly}
        consultOnly={consultOnly}
        draft={mine.draft}
        onSubmitted={() => {
          mine.setDraft(undefined);
          void mine.refresh();
        }}
        onDiscardDraft={() => mine.setDraft(undefined)}
      />
      <MisSolicitudes
        solicitudes={mine.requests}
        currentUser={user}
        procesoFiltro={process}
        onVerDetalle={setModalId}
        {...actions}
      />
      {modalRequest && (
        <RevisionModal
          solicitud={modalRequest}
          currentUser={user}
          readOnly={readOnly}
          onClose={() => setModalId(null)}
          // Aprobar/rechazar se hacen desde la Bandeja; aquí solo es consulta del solicitante.
          onRechazar={noop}
          onAprobar={noop}
          {...actions}
        />
      )}
    </>
  );
}
