import type { InputHTMLAttributes } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

/** Campo de formulario de acceso con etiqueta y error, conectado a react-hook-form. */
export default function AuthField({
  label,
  registration,
  error,
  ...inputProps
}: {
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = inputProps.id ?? registration.name;
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1.5" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="input w-full" {...inputProps} {...registration} />
      {error && <p className="mt-1.5 text-xs text-red-700">{error}</p>}
    </div>
  );
}
