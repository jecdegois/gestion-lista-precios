import Link from "next/link";
import type { UsersTab } from "../utils/user-format";

/** Pestañas como subrutas: pendientes de aprobación y listado completo. */
export default function UsersTabs({ tab, pendingCount }: { tab: UsersTab; pendingCount: number }) {
  return (
    <div className="tabs-list">
      <Link href="/configuracion/usuarios/pendientes" className={"tab-trigger" + (tab === "pending" ? " active" : "")}>
        Pendientes de aprobación
        {pendingCount > 0 && <span className="ml-2 badge badge-pendiente !py-0">{pendingCount}</span>}
      </Link>
      <Link href="/configuracion/usuarios" className={"tab-trigger" + (tab === "all" ? " active" : "")}>
        Todos los usuarios
      </Link>
    </div>
  );
}
