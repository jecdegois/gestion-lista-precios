"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ForgotPasswordInput, ForgotPasswordSchema } from "../../schemas/auth-schema";
import { forgotPassword } from "../../api/auth-api";
import AuthAlert from "../ui/AuthAlert";
import AuthField from "../ui/AuthField";
import AuthLayout from "../ui/AuthLayout";
import AuthLink from "../ui/AuthLink";
import AuthSubmitButton from "../ui/AuthSubmitButton";

export default function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [isNotice, setIsNotice] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(ForgotPasswordSchema) });

  async function onSubmit(data: ForgotPasswordInput) {
    if (isLoading) return;
    setIsLoading(true);
    setMessage("");

    const result = await forgotPassword(data);

    setIsLoading(false);
    setIsNotice(result.ok);
    setMessage(result.error ?? result.message ?? "");
  }

  return (
    <AuthLayout
      title="Recuperar contraseña"
      subtitle="Ingrese su correo corporativo para recibir el enlace de restablecimiento"
      footer={<>¿Ya tiene cuenta? <AuthLink href="/auth/login">Inicie sesión</AuthLink></>}
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <AuthField
          label="Correo corporativo"
          type="email"
          placeholder="usuario@empresa.com"
          autoComplete="username"
          disabled={isLoading}
          registration={register("email")}
          error={errors.email?.message}
        />
        {message && <AuthAlert variant={isNotice ? "info" : "error"}>{message}</AuthAlert>}
        <AuthSubmitButton loading={isLoading} label="Recuperar contraseña" loadingLabel="Enviando instrucciones..." />
      </form>
    </AuthLayout>
  );
}
