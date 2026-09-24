import Icon from "@/components/Icon";

export default function DraftBanner({ id, onDiscard }: { id: string; onDiscard: () => void }) {
  return (
    <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center gap-3">
      <Icon name="fileEdit" className="w-4 h-4 text-amber-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          Retomando borrador <span className="mono">{id}</span>
        </p>
        <p className="text-xs text-amber-700">
          Modifica los datos, vuelve a simular si es necesario y usa &quot;Enviar Solicitud&quot; cuando estés listo.
        </p>
      </div>
      <button className="btn btn-ghost btn-sm text-amber-700" onClick={onDiscard} title="Descartar y crear solicitud nueva">
        <Icon name="x" className="w-3.5 h-3.5" /> Descartar
      </button>
    </div>
  );
}
