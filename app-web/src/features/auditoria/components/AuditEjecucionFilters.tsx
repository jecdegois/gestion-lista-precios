"use client";

import Icon from "@/components/Icon";
import Dropdown, { type SelectOption } from "@/components/newComponents/Dropdown";
import type { EjecucionKey, EstadoEjecucion } from "@/lib/domain-types";
import { EJECUCION_LABELS } from "@/features/ejecucion/routes";

export const EXEC_AUDIT_ALL = "TODOS";

export type AuditEjecucionFilters = {
  tipo: string;
  estado: string;
  search: string;
};

export const AUDIT_EJECUCION_FILTERS_DEFAULT: AuditEjecucionFilters = {
  tipo:   EXEC_AUDIT_ALL,
  estado: EXEC_AUDIT_ALL,
  search: "",
};

const TIPO_OPTIONS: SelectOption[] = [
  { value: EXEC_AUDIT_ALL, label: "Todos los tipos" },
  ...(Object.keys(EJECUCION_LABELS) as EjecucionKey[]).map((key) => ({
    value: key,
    label: EJECUCION_LABELS[key],
  })),
];

const ESTADO_LABELS: Record<EstadoEjecucion, string> = {
  PENDIENTE:              "Pendiente",
  EN_PROCESO:             "En proceso",
  COMPLETADO:             "Completado",
  COMPLETADO_CON_ERRORES: "Completado c/ errores",
  ERROR:                  "Error",
};

const ESTADO_OPTIONS: SelectOption[] = [
  { value: EXEC_AUDIT_ALL, label: "Todos los estados" },
  ...(Object.keys(ESTADO_LABELS) as EstadoEjecucion[]).map((key) => ({
    value: key,
    label: ESTADO_LABELS[key],
  })),
];

/** Traduce el estado del formulario a params de API (undefined = sin filtro). */
export function toEjecucionApiParams(filters: AuditEjecucionFilters): {
  tipo?: string;
  estado?: string;
  search?: string;
} {
  return {
    tipo:   filters.tipo   !== EXEC_AUDIT_ALL ? filters.tipo   : undefined,
    estado: filters.estado !== EXEC_AUDIT_ALL ? filters.estado : undefined,
    search: filters.search.trim() || undefined,
  };
}

export default function AuditEjecucionFilters({
  filters,
  onChange,
}: {
  filters: AuditEjecucionFilters;
  onChange: (filters: AuditEjecucionFilters) => void;
}) {
  return (
    <div className="flex gap-3 flex-wrap items-end">
      <div className="w-48">
        <Dropdown
          id="exec-audit-filtro-tipo"
          label="Tipo"
          modelValue={filters.tipo}
          options={TIPO_OPTIONS}
          searchable={false}
          onChange={(tipo) => onChange({ ...filters, tipo })}
        />
      </div>
      <div className="w-56">
        <Dropdown
          id="exec-audit-filtro-estado"
          label="Estado"
          modelValue={filters.estado}
          options={ESTADO_OPTIONS}
          searchable={false}
          onChange={(estado) => onChange({ ...filters, estado })}
        />
      </div>
      <label className="relative w-full sm:w-80">
        <span className="sr-only">Buscar en ejecuciones</span>
        <Icon
          name="search"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
        />
        <input
          type="search"
          className="input w-full !pl-8"
          placeholder="Buscar por usuario, email o ID proceso..."
          aria-label="Buscar en ejecuciones directas"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </label>
    </div>
  );
}
