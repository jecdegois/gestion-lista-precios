import Icon from "@/components/Icon";
import type { UserStatusDomain } from "@/lib/domain-types";
import { USER_STATUS, type UserFilters } from "../utils/user-format";

export default function UsersFilters({
  filters,
  showStatus,
  onChange,
}: {
  filters: UserFilters;
  /** El filtro de estado no aplica a la pestaña de pendientes. */
  showStatus: boolean;
  onChange: (filters: UserFilters) => void;
}) {
  return (
    <div className="flex items-end gap-3 flex-wrap p-4 border-b border-zinc-200">
      <label className="relative flex-1 min-w-[220px]">
        <span className="sr-only">Buscar por nombre o correo</span>
        <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          className="input !pl-8"
          placeholder="Buscar por nombre o correo"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </label>
      {showStatus && (
        <label>
          <span className="sr-only">Filtrar por estado</span>
          <select
            className="input !w-44"
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value as UserStatusDomain | "" })}
          >
            <option value="">Todos los estados</option>
            {Object.entries(USER_STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
