import type { FieldErrors, UseFormRegister } from "react-hook-form";
import FormField from "@/shared/components/ui/FormField";
import type { UserFormInput } from "../../schemas/user-schema";

/** Correo, nombre y privilegio de administrador del formulario de usuario. */
export default function UserFields({
  register,
  errors,
  emailEditable,
  nameEditable,
}: {
  register: UseFormRegister<UserFormInput>;
  errors: FieldErrors<UserFormInput>;
  emailEditable: boolean;
  nameEditable: boolean;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Correo" error={errors.email?.message}>
          <input className="input" type="email" {...register("email")} disabled={!emailEditable} />
        </FormField>
        <FormField label="Nombre completo" error={errors.fullName?.message}>
          <input className="input" {...register("fullName")} disabled={!nameEditable} />
        </FormField>
      </div>

      <label className="flex items-start gap-2 text-sm text-zinc-700">
        <input type="checkbox" className="mt-0.5" {...register("isAdmin")} />
        <span>
          <b>Administrador global</b>
          <span className="block text-xs text-zinc-500">Gestiona usuarios y permisos. No otorga acceso operativo por sí solo.</span>
        </span>
      </label>
    </>
  );
}
