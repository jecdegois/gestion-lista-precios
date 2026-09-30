"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

export interface ComboOption {
  value: string;
  label: string;
  disabled?: boolean;
}

// Registro global de cierre (patrón anti-regresión del mockup).
const comboRegistry = new Set<() => void>();
if (typeof document !== "undefined") {
  const w = window as unknown as { __comboBound?: boolean };
  if (!w.__comboBound) {
    w.__comboBound = true;
    document.addEventListener("click", (e) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest(".combo-w")) return;
      comboRegistry.forEach((fn) => fn());
    });
    window.addEventListener("resize", () => comboRegistry.forEach((fn) => fn()));
    window.addEventListener("scroll", () => comboRegistry.forEach((fn) => fn()), true);
  }
}

function normalizar(texto: string): string {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (opt: ComboOption) => void;
  options: ComboOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const searchable = id === "codigo-articulo";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const closeFn = () => setOpen(false);
    comboRegistry.add(closeFn);
    return () => {
      comboRegistry.delete(closeFn);
    };
  }, []);

  function computePosition() {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }

  function handleOpen() {
    if (disabled) return;
    const wasOpen = open;
    comboRegistry.forEach((fn) => fn());
    if (!wasOpen) {
      if (searchable) setQuery("");
      computePosition();
      setOpen(true);
    }
  }

  function handlePick(ev: React.MouseEvent, opt: ComboOption) {
    ev.stopPropagation();
    if (opt.disabled) return;
    onChange(opt);
    setQuery("");
    setOpen(false);
  }

  const selected = options.find((o) => o.value === value);
  const consulta = normalizar(query.trim());
  const opcionesVisibles =
    !searchable || !consulta ? options : options.filter((opt) => normalizar(opt.label).indexOf(consulta) !== -1);
  const valorInput = searchable && open ? query : selected ? selected.label : "";

  return (
    <div className="combo-w">
      <input
        id={id}
        ref={triggerRef}
        className="combo-in"
        readOnly={!searchable}
        disabled={!!disabled}
        value={valorInput}
        placeholder={placeholder || "Seleccionar..."}
        onFocus={handleOpen}
        onClick={handleOpen}
        onChange={(ev) => {
          if (!searchable) return;
          setQuery(ev.target.value);
          if (!open) {
            computePosition();
            setOpen(true);
          }
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Escape") {
            setQuery("");
            setOpen(false);
          }
        }}
        style={searchable ? { cursor: "text" } : undefined}
      />
      <span className="chev">
        <Icon name="chevronDown" className="w-3.5 h-3.5" />
      </span>
      {open && !disabled && (
        <div className="combo-dd" style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {opcionesVisibles.map((opt) => (
            <div
              key={opt.value}
              className={"combo-opt" + (opt.disabled ? " opacity-40 cursor-not-allowed" : "")}
              title={opt.disabled ? "Fuera de su ámbito autorizado" : undefined}
              onClick={(ev) => handlePick(ev, opt)}
            >
              <span>{opt.label}</span>
              {opt.disabled && (
                <span className="badge badge-outline ml-auto" style={{ fontSize: 9 }}>
                  Sin acceso
                </span>
              )}
            </div>
          ))}
          {opcionesVisibles.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-400">No se encontraron artículos por código o nombre.</div>
          )}
        </div>
      )}
    </div>
  );
}
