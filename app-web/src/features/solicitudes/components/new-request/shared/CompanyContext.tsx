import Icon from "@/components/Icon";

export type CatalogStatus = { loading: boolean; error: string | null; noLevels: boolean };

/** Compañía de la sesión (no editable) y estado de carga del catálogo de listas. */
export default function CompanyContext({ company, status }: { company: string; status: CatalogStatus }) {
  const { loading, error, noLevels } = status;
  return (
    <div className="max-w-xs mb-4">
      <label className="block text-xs font-medium text-zinc-500 mb-1.5">Compañía</label>
      <div className="input flex items-center gap-2 bg-zinc-50">
        <Icon name="lock" className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-sm font-medium">{company}</span>
      </div>
      <p className="text-[11px] text-zinc-400 mt-1">Contexto resuelto automáticamente por Softland Security (S2/SS).</p>
      {loading && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-indigo-600">
          <Icon name="loader" className="w-3.5 h-3.5" spin /> Consultando listas de precio…
        </p>
      )}
      {error && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
          <b>No fue posible cargar el catálogo:</b> {error}
        </div>
      )}
      {!loading && !error && noLevels && (
        <p className="mt-2 text-xs text-amber-700">No hay niveles de precio activos disponibles para esta compañía.</p>
      )}
    </div>
  );
}
