import type { RoleCode } from "@/lib/domain-types";
import type { Catalogs } from "../../types";

export type RolesByCompany = Record<string, RoleCode | "">;

/** Un selector de rol por compañía; "Sin acceso" quita la asignación. */
export default function AssignmentsFieldset({
  catalogs,
  roles,
  onChange,
}: {
  catalogs: Catalogs;
  roles: RolesByCompany;
  onChange: (roles: RolesByCompany) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-medium text-zinc-600 mb-1.5">Rol por compañía</legend>
      <div className="rounded-lg border border-zinc-200 divide-y divide-zinc-200">
        {catalogs.companies.map((c) => (
          <div key={c.code} className="flex items-center justify-between gap-3 px-3 py-2">
            <label htmlFor={`role-${c.code}`} className="text-sm text-zinc-800">
              <span className="mono text-xs text-zinc-500 mr-2">{c.code}</span>
              {c.name}
            </label>
            <select
              id={`role-${c.code}`}
              className="input !w-48"
              value={roles[c.code] ?? ""}
              onChange={(e) => onChange({ ...roles, [c.code]: e.target.value as RoleCode | "" })}
            >
              <option value="">Sin acceso</option>
              {catalogs.roles.map((r) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
