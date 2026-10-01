"use client";

import Avatar from "@/shared/components/ui/Avatar";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import { roleLabel } from "@/shared/utils/format";
import ChangePasswordCard from "./ChangePasswordCard";

/** Perfil del usuario: datos de la cuenta y secciones de autoservicio (por ahora, la contraseña). */
export default function ProfileView() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <section className="card p-5 flex items-center gap-4">
        <Avatar name={user.nombre} className="w-12 h-12 text-sm" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-zinc-900 truncate">{user.nombre}</h2>
          <p className="text-sm text-zinc-500 truncate">{user.email}</p>
          <p className="text-xs text-zinc-500 mt-1">
            {roleLabel(user)}
            {user.companias?.length ? " · " + user.companias.join(", ") : ""}
          </p>
        </div>
      </section>

      <ChangePasswordCard />
    </div>
  );
}
