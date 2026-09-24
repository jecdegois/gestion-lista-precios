"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { SetPasswordInput, SetPasswordSchema } from "../../schemas/auth-schema";
import { setPassword } from "../../api/auth-api";
import AuthAlert from "../ui/AuthAlert";
import AuthField from "../ui/AuthField";
import AuthLayout from "../ui/AuthLayout";
import AuthSubmitButton from "../ui/AuthSubmitButton";

export default function SetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetPasswordInput>({ resolver: zodResolver(SetPasswordSchema) });

  async function onSubmit(data: SetPasswordInput) {
    if (isLoading || !token) return;
    setIsLoading(true);
    setMessage("");

    const result = await setPassword(data, token);
    setIsLoading(false);

    if (result.error) {
      setMessage(result.error);
      return;
    }
    router.push("/auth/login");
  }

  if (!token) {
    return (
      <AuthLayout>
        <AuthAlert variant="error">El enlace no es válido. Solicite uno nuevo desde la recuperación de contraseña.</AuthAlert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Definir nueva contraseña" subtitle="Verificando el enlace de restablecimiento...">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <AuthField
          label="Nueva contraseña"
          type="password"
          placeholder="Mínimo 15 caracteres"
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
        <AuthSubmitButton loading={isLoading} label="Reestablecer contraseña" loadingLabel="Reestableciendo..." />
      </form>
    </AuthLayout>
  );
}
