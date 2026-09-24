import Icon from "@/components/Icon";
import type { SubmissionState } from "../../../types";

/** Botones de simular, guardar borrador y enviar a aprobación. */
export default function RequestActions({
  simulateLabel = "Simular impacto",
  canSimulate,
  onSimulate,
  canSave,
  canSubmit,
  destructive = false,
  submission,
  onSave,
  onSubmit,
}: {
  simulateLabel?: string;
  canSimulate: boolean;
  onSimulate: () => void;
  canSave: boolean;
  canSubmit: boolean;
  destructive?: boolean;
  submission: SubmissionState;
  onSave: () => void;
  onSubmit: () => void;
}) {
  const { sending, savingDraft, sent } = submission;
  return (
    <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
      <button className="btn btn-outline" disabled={!canSimulate} onClick={onSimulate}>
        <Icon name="search" className="w-3.5 h-3.5" /> {simulateLabel}
      </button>
      <button
        className="btn btn-outline"
        disabled={!canSave || savingDraft || sending}
        onClick={onSave}
        title="Simula el impacto primero para poder guardar el borrador"
      >
        {savingDraft ? (
          <><Icon name="loader" className="w-3.5 h-3.5" spin /> Guardando…</>
        ) : (
          <><Icon name="save" className="w-3.5 h-3.5" /> Guardar borrador</>
        )}
      </button>
      <button className={"btn " + (destructive ? "btn-destructive" : "btn-default")} disabled={!canSubmit || sending} onClick={onSubmit}>
        {sending ? (
          <><Icon name="loader" className="w-3.5 h-3.5" spin /> Enviando…</>
        ) : sent ? (
          <><Icon name="check" className="w-3.5 h-3.5" /> Enviado</>
        ) : (
          "Enviar Solicitud"
        )}
      </button>
    </div>
  );
}
