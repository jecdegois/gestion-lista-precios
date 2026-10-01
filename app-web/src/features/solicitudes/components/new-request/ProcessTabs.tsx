"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PROCESOS } from "@/features/solicitudes/utils/catalog";
import type { ProcesoKey } from "@/shared/types/domain-types";
import { ROUTE_BY_PROCESS } from "../../routes";

export default function ProcessTabs() {
  const pathname = usePathname();

  return (
    <div className="tabs-list mb-4">
      {(Object.entries(ROUTE_BY_PROCESS) as [ProcesoKey, string][]).map(([process, href]) => (
        <Link key={process} href={href} className={"tab-trigger" + (pathname === href ? " active" : "")}>
          {PROCESOS[process].label}
        </Link>
      ))}
    </div>
  );
}
