import clsx from "clsx";

/** Campo de formulario: etiqueta, control y ayuda opcional debajo. */
export default function FormField({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="block text-xs font-medium text-zinc-600 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-zinc-500 mt-1">{hint}</span>}
    </label>
  );
}
