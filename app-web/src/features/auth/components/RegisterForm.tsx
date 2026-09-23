"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SignUpInput, SignUpSchema } from "../schemas/auth-schema";
import { signUpAction } from "../actions/auth-actions";
import Icon from "@/components/Icon";

export default function RegisterForm() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(SignUpSchema),
  });

  async function onSubmit(data: SignUpInput) {
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    setNotice("");

    const result = await signUpAction(data);

    setIsLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice(result.message ?? "Solicitud recibida");
    reset();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-white">
      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-lg bg-zinc-900 flex items-center justify-center text-white font-bold text-lg mx-auto mb-4 shadow-md">
            GP
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-1">Gestión Masiva de Precios</h1>
          <p className="text-zinc-500 text-sm">Sistema de automatización de listas de precio</p>
        </div>

        <div className="card p-8 shadow-lg border border-zinc-100">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-1">Solicitar acceso</h2>
            <p className="text-zinc-500 text-sm">
              La cuenta queda pendiente de aprobación por un administrador
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5" htmlFor="name">
                Nombre completo
              </label>
              <input
                id="name"
                type="text"
                placeholder="Nombre y apellido"
                className="input w-full"
                autoComplete="name"
                disabled={isLoading}
                {...register("name")}
              />
              {errors.name && <p className="mt-1.5 text-xs text-red-700">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5" htmlFor="email">
                Correo corporativo
              </label>
              <input
                id="email"
                type="email"
                placeholder="usuario@empresa.com"
                className="input w-full"
                autoComplete="username"
                disabled={isLoading}
                {...register("email")}
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-700">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                placeholder="Mínimo 15 caracteres"
                className="input w-full"
                autoComplete="new-password"
                disabled={isLoading}
                {...register("password")}
              />
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-700">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label
                className="block text-xs font-medium text-zinc-600 mb-1.5"
                htmlFor="passwordConfirmation"
              >
                Repetir contraseña
              </label>
              <input
                id="passwordConfirmation"
                type="password"
                placeholder="Repita su contraseña"
                className="input w-full"
                autoComplete="new-password"
                disabled={isLoading}
                {...register("passwordConfirmation")}
              />
              {errors.passwordConfirmation && (
                <p className="mt-1.5 text-xs text-red-700">
                  {errors.passwordConfirmation.message}
                </p>
              )}
            </div>

            {error && (
              <div
                className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700"
                role="alert"
              >
                <Icon name="alertTriangle" className="w-3.5 h-3.5 inline mr-1.5" />
                {error}
              </div>
            )}
            {notice && (
              <div
                className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700"
                role="status"
              >
                <Icon name="info" className="w-3.5 h-3.5 inline mr-1.5" />
                {notice}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="w-full btn btn-default">
              {isLoading ? (
                <><Icon name="loader" className="w-4 h-4" spin /> Registrando solicitud...</>
              ) : (
                <><Icon name="check" className="w-4 h-4" /> Registrarse</>
              )}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center space-y-1">
          <p className="text-zinc-500 text-xs">
            ¿Ya tiene cuenta?{" "}
            <a href="/auth/login" className="text-blue-600 hover:underline">Inicie sesión</a>
          </p>
        </div>
      </div>
    </div>
  );
}
