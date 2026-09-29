"use client";

import Icon from "@/components/Icon";
import Dropdown, { type SelectOption } from "@/components/newComponents/Dropdown";
import { EVENTOS_AUDITORIA } from "@/lib/events";
import type { EventoTipo, Rol } from "@/lib/domain-types";

export const AUDIT_ALL = "TODOS";

export type AuditFilters = {
  rol: string;
  evento: string;
  search: string;
};

const ROL_OPTIONS: SelectOption[] = [
  { value: AUDIT_ALL, label: "Todos los roles" },
  { value: "OPERADOR", label: "Operador" },
  { value: "APROBADOR", label: "Aprobador" },
  { value: "AUDITOR", label: "Auditor" },
];

const EVENTO_OPTIONS: SelectOption[] = [
  { value: AUDIT_ALL, label: "Todos los eventos" },
  ...(Object.keys(EVENTOS_AUDITORIA) as EventoTipo[]).map((key) => ({
    value: key,
    label: EVENTOS_AUDITORIA[key],
  })),
];

export const AUDIT_FILTERS_DEFAULT: AuditFilters = {
  rol: AUDIT_ALL,
  evento: AUDIT_ALL,
  search: "",
};

/** Devuelve los params que deben enviarse a la API (undefined = no filtrar). */
export function toApiParams(filters: AuditFilters): {
  rol?: string;
  evento?: string;
  search?: string;
} {
  return {
    rol: filters.rol !== AUDIT_ALL ? (filters.rol as Rol) : undefined,
    evento: filters.evento !== AUDIT_ALL ? (filters.evento as EventoTipo) : undefined,
    search: filters.search.trim() || undefined,
  };
}

export default function AuditFilters({
  filters,
  onChange,
}: {
  filters: AuditFilters;
  onChange: (filters: AuditFilters) => void;
}) {
  return (
    <div className="flex gap-3 flex-wrap items-end">
      <div className="w-44">
        <Dropdown
          id="audit-filtro-rol"
          label="Rol"
          modelValue={filters.rol}
          options={ROL_OPTIONS}
          searchable={false}
          onChange={(rol) => onChange({ ...filters, rol })}
        />
      </div>
      <div className="w-72">
        <Dropdown
          id="audit-filtro-evento"
          label="Evento"
          modelValue={filters.evento}
          options={EVENTO_OPTIONS}
          searchable
          onChange={(evento) => onChange({ ...filters, evento })}
        />
      </div>
      <label className="relative w-full sm:w-80">
        <span className="sr-only">Buscar en auditoría</span>
        <Icon
          name="search"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
        />
        <input
          type="search"
          className="input w-full !pl-8"
          placeholder="Buscar por usuario, ID solicitud o proceso..."
          aria-label="Buscar en la auditoría"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </label>
    </div>
  );
}
