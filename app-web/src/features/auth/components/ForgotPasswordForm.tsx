"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ForgotPasswordInput, ForgotPasswordSchema } from "../schemas/auth-schema";
import { forgotPassword } from "../api/auth-api";
import Icon from "@/components/Icon";

export default function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [isNotice, setIsNotice] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
  });

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
            <h2 className="text-lg font-semibold text-zinc-900 mb-1">Recuperar contraseña</h2>
            <p className="text-zinc-500 text-sm">
              Ingrese su correo corporativo para recibir el enlace de restablecimiento
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
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

            {message && (
              <div
                className={
                  isNotice
                    ? "rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700"
                    : "rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700"
                }
                role={isNotice ? "status" : "alert"}
              >
                <Icon
                  name={isNotice ? "info" : "alertTriangle"}
                  className="w-3.5 h-3.5 inline mr-1.5"
                />
                {message}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="w-full btn btn-default">
              {isLoading ? (
                <><Icon name="loader" className="w-4 h-4" spin /> Enviando instrucciones...</>
              ) : (
                <><Icon name="check" className="w-4 h-4" /> Recuperar contraseña</>
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
