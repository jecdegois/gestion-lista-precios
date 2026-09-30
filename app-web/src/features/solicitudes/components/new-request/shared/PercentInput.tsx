/** Campo numérico de porcentaje con mensaje de error o ayuda opcional. */
export default function PercentInput({
  id,
  label,
  value,
  disabled,
  error,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  error?: string | null;
  hint?: React.ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-zinc-500 mb-1.5">{label}</label>
      <input
        id={id}
        type="number"
        step="0.01"
        min="0"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ej. 10"
        className="input"
      />
      {error ? <p className="text-[11px] text-red-600 mt-1">{error}</p> : hint && <p className="text-[11px] text-zinc-500 mt-1">{hint}</p>}
    </div>
  );
}
