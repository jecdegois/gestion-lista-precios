"use client";

import Avatar from "@/shared/components/ui/Avatar";
import Icon from "@/shared/components/ui/Icon";
import Menu from "@/shared/components/ui/Menu";

/** Menú del usuario en el header: el avatar abre Perfil y Cerrar sesión. */
export default function UserMenu({ name, onLogout }: { name: string; onLogout: () => void }) {
  return (
    <Menu
      label="Menú de usuario"
      trigger={
        <>
          <Avatar name={name} className="w-8 h-8 text-[11px]" />
          <Icon name="chevronDown" className="w-3.5 h-3.5 text-zinc-500" />
        </>
      }
      items={[
        { label: "Perfil", icon: "user", href: "/perfil" },
        { label: "Cerrar sesión", icon: "logout", onSelect: onLogout },
      ]}
    />
  );
}
