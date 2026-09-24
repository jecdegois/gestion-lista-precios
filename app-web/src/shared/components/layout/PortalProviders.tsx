"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { Identidad } from "@/lib/domain-types";

type ToastVariant = "success" | "error";
type Toast = { id: number; message: string; variant?: ToastVariant };
type PushToast = (message: string, variant?: ToastVariant) => void;

const UserContext = createContext<Identidad | null>(null);
const ToastContext = createContext<PushToast>(() => {});

/** Usuario autenticado del portal; solo disponible bajo el layout (portal). */
export function useCurrentUser(): Identidad {
  const user = useContext(UserContext);
  if (!user) throw new Error("useCurrentUser debe usarse dentro de PortalProviders");
  return user;
}

export function useToast(): PushToast {
  return useContext(ToastContext);
}

export default function PortalProviders({ user, children }: { user: Identidad; children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback<PushToast>((message, variant) => {
    const id = Date.now() + Math.random();
    setToasts((t) => t.concat([{ id, message, variant }]));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  return (
    <UserContext.Provider value={user}>
      <ToastContext.Provider value={pushToast}>
        {children}
        <div className="toast-wrap">
          {toasts.map((t) => (
            <div key={t.id} className={"toast" + (t.variant ? " " + t.variant : "")}>
              {t.message}
            </div>
          ))}
        </div>
      </ToastContext.Provider>
    </UserContext.Provider>
  );
}
