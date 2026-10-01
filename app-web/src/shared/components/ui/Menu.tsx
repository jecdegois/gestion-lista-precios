"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/shared/components/ui/Icon";

/** Opción del menú: con `href` navega; con `onSelect` ejecuta una acción. */
export type MenuItem = { label: string; icon?: string } & ({ href: string } | { onSelect: () => void });

const itemClass =
  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] text-zinc-700 hover:bg-zinc-100 focus:bg-zinc-100 outline-none";

/** Menú desplegable: `trigger` lo abre; se cierra al elegir una opción, con clic fuera o con Escape. */
export default function Menu({ label, trigger, items }: { label: string; trigger: React.ReactNode; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex items-center gap-1 rounded-full"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>

      {open && (
        <div role="menu" aria-label={label} className="absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl">
          {items.map((item) => {
            const content = (
              <>
                {item.icon && <Icon name={item.icon} className="w-4 h-4" />} {item.label}
              </>
            );
            return "href" in item ? (
              <Link key={item.label} role="menuitem" href={item.href} className={itemClass} onClick={() => setOpen(false)}>
                {content}
              </Link>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                className={itemClass}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
