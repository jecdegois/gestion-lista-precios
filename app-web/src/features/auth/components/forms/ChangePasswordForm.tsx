"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { ChangePasswordInput, ChangePasswordSchema } from "../../schemas/auth-schema";
import { changePassword, signOut } from "../../api/auth-api";
import AuthAlert from "../ui/AuthAlert";
import AuthField from "../ui/AuthField";
import AuthLayout from "../ui/AuthLayout";
import AuthLink from "../ui/AuthLink";
import AuthSubmitButton from "../ui/AuthSubmitButton";

/** `forced`: contraseña temporal; no se puede volver al portal sin cambiarla. */
export default function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(ChangePasswordSchema) });

  async function onSubmit(data: ChangePasswordInput) {
    if (isLoading) return;
    setIsLoading(true);
    setMessage("");

    const result = await changePassword(data);
    setIsLoading(false);

    if (result.error) {
      setMessage(result.error);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function handleLogout() {
    await signOut();
    router.push("/auth/login");
  }

  return (
    <AuthLayout
      title="Cambiar contraseña"
      subtitle={forced ? "Su contraseña es temporal. Defina una nueva para continuar." : undefined}
      footer={
        forced ? (
          <button type="button" className="underline" onClick={handleLogout}>Cerrar sesión</button>
        ) : (
          <AuthLink href="/">Volver al portal</AuthLink>
        )
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <AuthField
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          disabled={isLoading}
          registration={register("currentPassword")}
          error={errors.currentPassword?.message}
        />
        <AuthField
          label="Nueva contraseña"
          type="password"
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
          disabled={isLoading}
          registration={register("newPassword")}
          error={errors.newPassword?.message}
        />
        <AuthField
          label="Repetir contraseña"
          type="password"
          placeholder="Repita su contraseña"
          autoComplete="new-password"
          disabled={isLoading}
          registration={register("passwordConfirmation")}
          error={errors.passwordConfirmation?.message}
        />
        {message && <AuthAlert variant="error">{message}</AuthAlert>}
        <AuthSubmitButton loading={isLoading} label="Cambiar contraseña" loadingLabel="Guardando..." />
      </form>
    </AuthLayout>
  );
}
