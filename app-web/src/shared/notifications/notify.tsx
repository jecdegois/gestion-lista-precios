"use client";

/**
 * Adaptador de notificaciones: único archivo que conoce react-hot-toast.
 * El resto de la app usa `notify` y `<NotificationHost />`; cambiar de librería
 * solo toca este archivo.
 */
import toast, { Toaster } from "react-hot-toast";

export type NotifyVariant = "success" | "error" | "info";

const DURATION_MS = 3400;

export const notify = {
  success: (message: string) => void toast.success(message),
  error: (message: string) => void toast.error(message),
  info: (message: string) => void toast(message),
  show: (message: string, variant: NotifyVariant = "info") => notify[variant](message),
  /** Muestra cargando → éxito/error según la promesa; devuelve la misma promesa. */
  promise: <T,>(promise: Promise<T>, messages: { loading: string; success: string; error: string }) =>
    toast.promise(promise, messages),
};

/** Contenedor de notificaciones; se monta una vez en el layout raíz. */
export function NotificationHost() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: DURATION_MS,
        style: { background: "#18181b", color: "#fff", fontSize: 13, borderRadius: 10 },
        success: { style: { background: "#15803D" }, iconTheme: { primary: "#fff", secondary: "#15803D" } },
        error: { style: { background: "#DC2626" }, iconTheme: { primary: "#fff", secondary: "#DC2626" } },
      }}
    />
  );
}
