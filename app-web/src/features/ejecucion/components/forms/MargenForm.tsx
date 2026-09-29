"use client";

import { useState } from "react";

/**
 * Formulario cuerpo para la ejecución del SP de Margen de Utilidad.
 * Por ahora es solo el esqueleto visual — sin lógica de envío real.
 */
export default function MargenForm() {
  const [lista, setLista] = useState("");
  const [porcentajeReduccion, setPorcentajeReduccion] = useState("");

  return (
    <div className="flex flex-col gap-5">
      {/* Descripción */}
      <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3 text-xs text-zinc-600">
        Ejecuta directamente el SP de Margen para recalcular el{" "}
        <span className="font-semibold">Margen Mínimo de Utilidad</span> (Regla de Mayoreo)
        aplicando un porcentaje de reducción masivo sobre los artículos de la lista seleccionada.
        Solo disponible cuando <span className="mono">SOFTLAND_EXECUTION_ENABLED=true</span>.
      </div>

      {/* Campos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Lista de precio */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Lista de precio</label>
          <input
            className="input"
            placeholder="Ej. MAYOREOD"
            value={lista}
            onChange={(e) => setLista(e.target.value)}
          />
          <p className="text-[11px] text-zinc-400">Lista base sobre la que se recalcula el margen.</p>
        </div>

        {/* Porcentaje de reducción */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Porcentaje de reducción (%)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="Ej. 10"
            value={porcentajeReduccion}
            onChange={(e) => setPorcentajeReduccion(e.target.value)}
          />
          <p className="text-[11px] text-zinc-400">Reducción aplicada al margen mínimo vigente. Rango: 0–100.</p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-3 pt-1">
        <button
          className="btn btn-default"
          disabled
          title="Funcionalidad pendiente — requiere PASO 4 completo"
        >
          Ejecutar SP Margen
        </button>
        <span className="text-[11px] text-zinc-400">
          Pendiente integración PASO 4
        </span>
      </div>
    </div>
  );
}
