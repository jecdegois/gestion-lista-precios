"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SignUpInput, SignUpSchema } from "../../schemas/auth-schema";
import { signUp } from "../../api/auth-api";
import AuthAlert from "../ui/AuthAlert";
import AuthField from "../ui/AuthField";
import AuthLayout from "../ui/AuthLayout";
import AuthLink from "../ui/AuthLink";
import AuthSubmitButton from "../ui/AuthSubmitButton";

export default function RegisterForm() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SignUpInput>({ resolver: zodResolver(SignUpSchema) });

  async function onSubmit(data: SignUpInput) {
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    setNotice("");

    const result = await signUp(data);
    setIsLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice(result.message ?? "Solicitud recibida");
    reset();
  }

  return (
    <AuthLayout
      title="Solicitar acceso"
      subtitle="La cuenta queda pendiente de aprobación por un administrador"
      footer={<>¿Ya tiene cuenta? <AuthLink href="/auth/login">Inicie sesión</AuthLink></>}
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <AuthField
          label="Nombre completo"
          type="text"
          placeholder="Nombre y apellido"
          autoComplete="name"
          disabled={isLoading}
          registration={register("name")}
          error={errors.name?.message}
        />
        <AuthField
          label="Correo corporativo"
          type="email"
          placeholder="usuario@empresa.com"
          autoComplete="username"
          disabled={isLoading}
          registration={register("email")}
          error={errors.email?.message}
        />
        <AuthField
          label="Contraseña"
          type="password"
          placeholder="Mínimo 15 caracteres"
          autoComplete="new-password"
          disabled={isLoading}
          registration={register("password")}
          error={errors.password?.message}
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
        {error && <AuthAlert variant="error">{error}</AuthAlert>}
        {notice && <AuthAlert variant="info">{notice}</AuthAlert>}
        <AuthSubmitButton loading={isLoading} label="Registrarse" loadingLabel="Registrando solicitud..." />
      </form>
    </AuthLayout>
  );
}
