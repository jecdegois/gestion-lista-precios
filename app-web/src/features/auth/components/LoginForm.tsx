"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SignInInput, SignInSchema } from "../schemas/auth-schema";
import { signIn } from "../api/auth-api";
import Icon from "@/components/Icon";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(SignInSchema),
  });

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

    if (result.message === "Su cuenta está pendiente de aprobación") {
      setNotice(result.message);
      setIsLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
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
            <h2 className="text-lg font-semibold text-zinc-900 mb-1">Ingrese sus credenciales</h2>
            <p className="text-zinc-500 text-sm">Autentíquese con su cuenta corporativa para continuar</p>
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

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••••••"
                className="input w-full"
                autoComplete="current-password"
                disabled={isLoading}
                {...register("password")}
              />
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-700">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700" role="alert">
                <Icon name="alertTriangle" className="w-3.5 h-3.5 inline mr-1.5" />
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700" role="status">
                <Icon name="info" className="w-3.5 h-3.5 inline mr-1.5" />
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn btn-default"
            >
              {isLoading ? (
                <><Icon name="loader" className="w-4 h-4" spin /> Validando credenciales...</>
              ) : (
                <><Icon name="check" className="w-4 h-4" /> Iniciar sesión</>
              )}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center space-y-1">
          <p className="text-zinc-500 text-xs">
            ¿No tiene cuenta?{" "}
            <a href="/auth/registro" className="text-blue-600 hover:underline">Solicite acceso</a>
            {" · "}
            <a href="/auth/recuperar" className="text-blue-600 hover:underline">Olvidé mi contraseña</a>
          </p>
        </div>
      </div>
    </div>
  );
}
