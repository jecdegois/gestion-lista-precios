"use client";

import { useState } from "react";

/**
 * Formulario cuerpo para la ejecución de SP de Precios (Factor / Gestión Global).
 * Por ahora es solo el esqueleto visual — sin lógica de envío real.
 */
export default function PreciosForm() {
  const [lista, setLista] = useState("");
  const [factor, setFactor] = useState("");

  return (
    <div className="flex flex-col gap-5">
      {/* Descripción */}
      <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3 text-xs text-zinc-600">
        Ejecuta directamente el SP <span className="mono font-semibold">SP_EJECUTAR_SOLICITUD_APROBADA</span> para
        actualizar los precios de la lista seleccionada aplicando el factor indicado.
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
          <p className="text-[11px] text-zinc-400">Código de la lista objetivo en Softland.</p>
        </div>

        {/* Factor */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-700">Factor (%)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="-100"
            max="100"
            placeholder="Ej. 5.5"
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
          />
          <p className="text-[11px] text-zinc-400">Porcentaje de variación. Positivo = aumento, negativo = rebaja.</p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-3 pt-1">
        <button
          className="btn btn-default"
          disabled
          title="Funcionalidad pendiente — requiere PASO 4 completo"
        >
          Ejecutar SP Precios
        </button>
        <span className="text-[11px] text-zinc-400">
          Pendiente integración PASO 4
        </span>
      </div>
    </div>
  );
}
