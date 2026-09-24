import Icon from "@/components/Icon";
import Dropdown, { type SelectOption } from "@/components/newComponents/Dropdown";
import { PROCESOS } from "@/lib/catalog";
import type { ProcesoKey } from "@/lib/domain-types";
import { ALL, INBOX_STATUSES, type InboxFilters as Filters } from "../../utils/inbox-filters";

const STATUS_OPTIONS: SelectOption[] = INBOX_STATUSES.map((s) => ({ value: s, label: s === ALL ? "Todos los estados" : s }));

const PROCESS_OPTIONS: SelectOption[] = [
  { value: ALL, label: "Todos los procesos" },
  ...(Object.keys(PROCESOS) as ProcesoKey[]).map((key) => ({ value: key, label: PROCESOS[key].label })),
];

export default function InboxFilters({ filters, onChange }: { filters: Filters; onChange: (filters: Filters) => void }) {
  return (
    <div className="flex gap-3 flex-wrap items-end">
      <div className="w-56">
        <Dropdown
          id="filtro-estado"
          label="Estado"
          modelValue={filters.status}
          options={STATUS_OPTIONS}
          searchable={false}
          onChange={(status) => onChange({ ...filters, status })}
        />
      </div>
      <div className="w-56">
        <Dropdown
          id="filtro-proceso"
          label="Proceso"
          modelValue={filters.process}
          options={PROCESS_OPTIONS}
          searchable={false}
          onChange={(process) => onChange({ ...filters, process })}
        />
      </div>
      <label className="relative w-full sm:w-80">
        <span className="sr-only">Buscar solicitudes</span>
        <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          className="input w-full !pl-8"
          placeholder="Buscar por coincidencia..."
          aria-label="Buscar solicitudes por coincidencia"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </label>
    </div>
  );
}
