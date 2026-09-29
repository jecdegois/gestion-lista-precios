"use client";

import { useState } from "react";

/**
 * Formulario cuerpo para la ejecución del SP de Descuento por artículo-lista.
 * Por ahora es solo el esqueleto visual — sin lógica de envío real.
 */
export default function DescuentoForm() {
  const [articulo, setArticulo] = useState("");
  const [lista, setLista] = useState("");
  const [descuento, setDescuento] = useState("");

  return (
    <div className="flex flex-col gap-5">
      {/* Descripción */}
      <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3 text-xs text-zinc-600">
        Ejecuta directamente el SP de Descuento para aplicar un descuento puntual sobre un artículo
        en la lista seleccionada.
        Solo disponible cuando <span className="mono">SOFTLAND_EXECUTION_ENABLED=true</span>.
      </div>

      {/* Campos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Artículo */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Código de artículo</label>
          <input
            className="input"
            placeholder="Ej. ART-231"
            value={articulo}
            onChange={(e) => setArticulo(e.target.value)}
          />
          <p className="text-[11px] text-zinc-400">Código SKU del artículo en Softland.</p>
        </div>

        {/* Lista */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Lista de precio</label>
          <input
            className="input"
            placeholder="Ej. LPV1"
            value={lista}
            onChange={(e) => setLista(e.target.value)}
          />
          <p className="text-[11px] text-zinc-400">Lista destino del descuento.</p>
        </div>

        {/* Descuento */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Descuento (%)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="Ej. 15"
            value={descuento}
            onChange={(e) => setDescuento(e.target.value)}
          />
          <p className="text-[11px] text-zinc-400">Porcentaje de descuento a aplicar. Rango: 0–100.</p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-3 pt-1">
        <button
          className="btn btn-default"
          disabled
          title="Funcionalidad pendiente — requiere PASO 4 completo"
        >
          Ejecutar SP Descuento
        </button>
        <span className="text-[11px] text-zinc-400">
          Pendiente integración PASO 4
        </span>
      </div>
    </div>
  );
}
