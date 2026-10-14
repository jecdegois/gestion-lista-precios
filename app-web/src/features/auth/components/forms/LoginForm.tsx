"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  // La vuelta del login con Google trae el resultado en la query.
  const searchParams = useSearchParams();
  const [error, setError] = useState(searchParams.get("error") ?? "");
  const [notice, setNotice] = useState(searchParams.get("aviso") ?? "");
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
          label="Correo"
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
      {/* Login con Google oculto temporalmente; el backend sigue disponible. */}
      {false && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-gray-200" />o<span className="h-px flex-1 bg-gray-200" />
          </div>
          <a href="/api/auth/google" className="w-full btn btn-outline gap-3 py-2.5" aria-disabled={isLoading}>
            {/* Logo "G" oficial de Google */}
            <svg viewBox="0 0 48 48" className="w-4 h-4" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Continuar con Google
          </a>
        </>
      )}
    </AuthLayout>
  );
}
