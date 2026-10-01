import clsx from "clsx";
import { initials } from "@/shared/components/ui/Icon";

/** Iniciales del usuario sobre el color de énfasis de la compañía; el tamaño lo da `className`. */
export default function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={clsx("avatar", className)} style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
      {initials(name)}
    </span>
  );
}
