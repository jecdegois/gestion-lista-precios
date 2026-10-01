"use client";

import { createContext, useContext } from "react";
import type { Identidad } from "@/shared/types/domain-types";
import { fmtMonto } from "@/shared/utils/format";

const UserContext = createContext<Identidad | null>(null);

/** Usuario autenticado del portal; solo disponible bajo el layout (portal). */
export function useCurrentUser(): Identidad {
  const user = useContext(UserContext);
  if (!user) throw new Error("useCurrentUser debe usarse dentro de PortalProviders");
  return user;
}

/** Monto formateado con la moneda de la compañía activa. */
export function Monto({ n }: { n: number | null | undefined }) {
  return <>{fmtMonto(n, useContext(UserContext)?.moneda)}</>;
}

export default function PortalProviders({ user, children }: { user: Identidad; children: React.ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
