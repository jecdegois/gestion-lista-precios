"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { SetPasswordInput, SetPasswordSchema } from "../schemas/auth-schema";
import { setPasswordAction } from "../actions/auth-actions";
import Icon from "@/components/Icon";

export default function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetPasswordInput>({
    resolver: zodResolver(SetPasswordSchema),
  });

  async function onSubmit(data: SetPasswordInput) {
    if (isLoading || !token) return;
    setIsLoading(true);
    setMessage("");

    const result = await setPasswordAction(data, token);

    setIsLoading(false);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    router.push("/auth/login");
  }

  if (!token) {
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
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
              <Icon name="alertTriangle" className="w-3.5 h-3.5 inline mr-1.5" />
              El enlace no es válido. Solicite uno nuevo desde la recuperación de contraseña.
            </div>
          </div>
        </div>
      </div>
    );
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
            <h2 className="text-lg font-semibold text-zinc-900 mb-1">Definir nueva contraseña</h2>
            <p className="text-zinc-500 text-sm">Verificando el enlace de restablecimiento...</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label
                className="block text-xs font-medium text-zinc-600 mb-1.5"
                htmlFor="newPassword"
              >
                Nueva contraseña
              </label>
              <input
                id="newPassword"
                type="password"
                placeholder="Mínimo 15 caracteres"
                className="input w-full"
                autoComplete="new-password"
                disabled={isLoading}
                {...register("newPassword")}
              />
              {errors.newPassword && (
                <p className="mt-1.5 text-xs text-red-700">{errors.newPassword.message}</p>
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

            {message && (
              <div
                className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700"
                role="alert"
              >
                <Icon name="alertTriangle" className="w-3.5 h-3.5 inline mr-1.5" />
                {message}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="w-full btn btn-default">
              {isLoading ? (
                <><Icon name="loader" className="w-4 h-4" spin /> Reestableciendo...</>
              ) : (
                <><Icon name="check" className="w-4 h-4" /> Reestablecer contraseña</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
