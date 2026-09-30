"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SignInInput, SignInSchema } from "../../schemas/auth-schema";
import { signIn } from "../../api/auth-api";
import AuthAlert from "../ui/AuthAlert";
import AuthField from "../ui/AuthField";
import AuthLayout from "../ui/AuthLayout";
import AuthLink from "../ui/AuthLink";
import AuthSubmitButton from "../ui/AuthSubmitButton";

const PENDING_MESSAGE = "Su cuenta está pendiente de aprobación";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({ resolver: zodResolver(SignInSchema) });

  async function onSubmit(data: SignInInput) {
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    setNotice("");

    const result = await signIn(data);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    if (result.message === PENDING_MESSAGE) {
      setNotice(result.message);
      setIsLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <AuthLayout
      title="Ingrese sus credenciales"
      subtitle="Autentíquese con su cuenta corporativa para continuar"
      footer={
        <>
          ¿No tiene cuenta? <AuthLink href="/auth/registro">Solicite acceso</AuthLink>
          {" · "}
          <AuthLink href="/auth/recuperar">Olvidé mi contraseña</AuthLink>
        </>
      }
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
        <AuthField
          label="Contraseña"
          type="password"
          placeholder="••••••••••••"
          autoComplete="current-password"
          disabled={isLoading}
          registration={register("password")}
          error={errors.password?.message}
        />
        {error && <AuthAlert variant="error">{error}</AuthAlert>}
        {notice && <AuthAlert variant="info">{notice}</AuthAlert>}
        <AuthSubmitButton loading={isLoading} label="Iniciar sesión" loadingLabel="Validando credenciales..." />
      </form>
    </AuthLayout>
  );
}
