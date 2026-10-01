import clsx from "clsx";

/** Campo de formulario: etiqueta, control y ayuda opcional debajo; el error reemplaza a la ayuda. */
export default function FormField({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="block text-xs font-medium text-zinc-600 mb-1.5">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="block text-[11px] text-red-600 mt-1">{error}</span>
      ) : (
        hint && <span className="block text-[11px] text-zinc-500 mt-1">{hint}</span>
      )}
    </label>
  );
}
