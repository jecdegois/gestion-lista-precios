import clsx from "clsx";

/** Muestra de color circular (decorativa: el valor se acompaña siempre con texto). */
export default function ColorSwatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={clsx("inline-block w-3 h-3 rounded-full border border-black/10 flex-none", className)}
      style={{ background: color }}
      aria-hidden
    />
  );
}
