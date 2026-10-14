"use client";

import { createContext, useContext } from "react";
import type { Identidad } from "@/shared/types/domain-types";
import { fmtMonto, simboloMoneda } from "@/shared/utils/format";

const UserContext = createContext<Identidad | null>(null);

/** Usuario autenticado del portal; solo disponible bajo el layout (portal). */
export function useCurrentUser(): Identidad {
  const user = useContext(UserContext);
  if (!user) throw new Error("useCurrentUser debe usarse dentro de PortalProviders");
  return user;
}

/** Monto formateado con la moneda de la compañía activa. */
export function Monto({ n, codigoMoneda }: { n: number | null | undefined; codigoMoneda?: string | null }) {
  const local = useContext(UserContext)?.moneda;
  return <>{fmtMonto(n, codigoMoneda === undefined ? local : simboloMoneda(codigoMoneda, local))}</>;
}

export default function PortalProviders({ user, children }: { user: Identidad; children: React.ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
