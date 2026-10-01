import FormField from "@/shared/components/ui/FormField";

export type BasicUserData = { email: string; fullName: string; isAdmin: boolean };

/** Correo, nombre y privilegio de administrador del formulario de usuario. */
export default function UserFields({
  data,
  emailEditable,
  nameEditable,
  onChange,
}: {
  data: BasicUserData;
  emailEditable: boolean;
  nameEditable: boolean;
  onChange: (data: BasicUserData) => void;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Correo">
          <input
            className="input"
            type="email"
            required
            value={data.email}
            disabled={!emailEditable}
            onChange={(e) => onChange({ ...data, email: e.target.value })}
          />
        </FormField>
        <FormField label="Nombre completo">
          <input
            className="input"
            required
            value={data.fullName}
            disabled={!nameEditable}
            onChange={(e) => onChange({ ...data, fullName: e.target.value })}
          />
        </FormField>
      </div>

      <label className="flex items-start gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={data.isAdmin}
          onChange={(e) => onChange({ ...data, isAdmin: e.target.checked })}
        />
        <span>
          <b>Administrador global</b>
          <span className="block text-xs text-zinc-500">Gestiona usuarios y permisos. No otorga acceso operativo por sí solo.</span>
        </span>
      </label>
    </>
  );
}
