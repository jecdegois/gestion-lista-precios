import type { UseFormRegister } from "react-hook-form";
import type { UserFormInput } from "../../schemas/user-schema";
import type { Catalogs } from "../../types";

/** Un selector de rol por compañía; "Sin acceso" quita la asignación. */
export default function AssignmentsFieldset({
  catalogs,
  register,
  error,
}: {
  catalogs: Catalogs;
  register: UseFormRegister<UserFormInput>;
  error?: string;
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
            <select id={`role-${c.code}`} className="input !w-48" {...register(`roles.${c.code}`)}>
              <option value="">Sin acceso</option>
              {catalogs.roles.map((r) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="text-[11px] text-red-600 mt-1">{error}</p>}
    </fieldset>
  );
}
