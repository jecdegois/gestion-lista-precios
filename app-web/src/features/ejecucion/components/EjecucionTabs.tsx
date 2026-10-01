"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { EjecucionKey } from "@/shared/types/domain-types";
import { EJECUCION_LABELS, ROUTE_BY_EJECUCION } from "../routes";

/** Pestañas ocultas temporalmente hasta que estén listas para producción. */
const TABS_OCULTOS = new Set<EjecucionKey>(["EJECUCION_MARGEN"]);

export default function EjecucionTabs() {
  const pathname = usePathname();

  return (
    <div className="tabs-list mb-4">
      {(Object.entries(ROUTE_BY_EJECUCION) as [EjecucionKey, string][])
        .filter(([tipo]) => !TABS_OCULTOS.has(tipo))
        .map(([tipo, href]) => (
          <Link
            key={tipo}
            href={href}
            className={"tab-trigger" + (pathname === href ? " active" : "")}
          >
            {EJECUCION_LABELS[tipo]}
          </Link>
        ))}
    </div>
  );
}
