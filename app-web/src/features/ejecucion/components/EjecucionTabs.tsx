"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { EjecucionKey } from "@/lib/domain-types";
import { EJECUCION_LABELS, ROUTE_BY_EJECUCION } from "../routes";

export default function EjecucionTabs() {
  const pathname = usePathname();

  return (
    <div className="tabs-list mb-4">
      {(Object.entries(ROUTE_BY_EJECUCION) as [EjecucionKey, string][]).map(([tipo, href]) => (
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
