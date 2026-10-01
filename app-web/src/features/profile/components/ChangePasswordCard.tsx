"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import FormField from "@/shared/components/ui/FormField";
import { notify } from "@/shared/notifications/notify";
import { changePassword } from "@/features/auth/api/auth-api";
import { ChangePasswordInput, ChangePasswordSchema } from "@/features/auth/schemas/auth-schema";

/** Cambio voluntario de contraseña desde el perfil (el forzado vive en /auth/cambiar-contrasena). */
export default function ChangePasswordCard() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(ChangePasswordSchema) });

  async function onSubmit(data: ChangePasswordInput) {
    const result = await changePassword(data);
    if (result.error) {
      notify.error(result.error);
      return;
    }
    reset();
    notify.success("Contraseña actualizada");
  }

  return (
    <section className="card p-5">
      <h3 className="text-sm font-semibold text-zinc-900 mb-4">Cambiar contraseña</h3>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
        <FormField label="Contraseña actual" error={errors.currentPassword?.message}>
          <input className="input" type="password" autoComplete="current-password" disabled={isSubmitting} {...register("currentPassword")} />
        </FormField>
        <FormField label="Nueva contraseña" hint="Mínimo 8 caracteres" error={errors.newPassword?.message}>
          <input className="input" type="password" autoComplete="new-password" disabled={isSubmitting} {...register("newPassword")} />
        </FormField>
        <FormField label="Repetir contraseña" error={errors.passwordConfirmation?.message}>
          <input className="input" type="password" autoComplete="new-password" disabled={isSubmitting} {...register("passwordConfirmation")} />
        </FormField>
        <div className="flex justify-end">
          <button type="submit" className="btn btn-default" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </div>
      </form>
    </section>
  );
}
