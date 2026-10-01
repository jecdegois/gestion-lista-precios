"use client";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Selector de color nativo sincronizado con un campo hex #RRGGBB editable a mano. */
export default function ColorInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (hex: string) => void;
  /** Nombre accesible del control (p. ej. "Color de marca"). */
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        className="w-9 h-9 rounded cursor-pointer border border-zinc-200 flex-none"
        aria-label={`Selector de ${label.toLowerCase()}`}
        value={HEX_COLOR.test(value) ? value.toLowerCase() : "#000000"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
      <input
        className="input mono"
        aria-label={label}
        maxLength={7}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
    </div>
  );
}
