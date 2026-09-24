import Icon from "@/components/Icon";

/** Encabezado del resultado de la simulación con exportación a Excel. */
export default function SimulationResult({
  exporting,
  exportDisabled = false,
  onExport,
  children,
}: {
  exporting: boolean;
  exportDisabled?: boolean;
  onExport: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 pt-5 border-t border-zinc-100">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="search" className="w-4 h-4 text-zinc-500" />
        <h3 className="text-sm font-semibold mr-auto">Resultado de la simulación</h3>
        <button className="btn btn-outline btn-sm" disabled={exporting || exportDisabled} onClick={onExport}>
          <Icon name="download" className="w-3.5 h-3.5" /> {exporting ? "Exportando…" : "Exportar Excel"}
        </button>
      </div>
      <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-xs text-green-800 mb-3 flex items-center gap-2">
        <Icon name="check" className="w-3.5 h-3.5" /> Simulación completada. Revise los valores resultantes antes de continuar.
      </div>
      {children}
    </div>
  );
}
