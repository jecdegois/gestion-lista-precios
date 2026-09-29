"use client";

import { type ComponentType, useEffect, useState } from "react";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import type { EjecucionKey, EjecucionLog } from "@/lib/domain-types";
import { EJECUCION_LABELS } from "../routes";
import EjecucionTabs from "./EjecucionTabs";
import UltimasEjecuciones from "./UltimasEjecuciones";
import PreciosForm from "./forms/PreciosForm";
import MargenForm from "./forms/MargenForm";
import DescuentoForm from "./forms/DescuentoForm";
import { listarEjecuciones } from "../api/ejecucion-api";

// ─── Mapa de formularios por tipo ────────────────────────────────────────────

const FORMS: Record<EjecucionKey, ComponentType> = {
  EJECUCION_PRECIOS:   PreciosForm,
  EJECUCION_MARGEN:    MargenForm,
  EJECUCION_DESCUENTO: DescuentoForm,
};

// ─── Descripciones por tipo ───────────────────────────────────────────────────

const DESCRIPCIONES: Record<EjecucionKey, string> = {
  EJECUCION_PRECIOS:
    "Actualización de precios mediante factor multiplicador sobre la lista seleccionada.",
  EJECUCION_MARGEN:
    "Recalculo masivo del Margen Mínimo de Utilidad (Regla de Mayoreo) por porcentaje de reducción.",
  EJECUCION_DESCUENTO:
    "Aplicación de descuento puntual por artículo y lista de precio en Softland.",
};

// ─── Vista principal ──────────────────────────────────────────────────────────

interface EjecucionViewProps {
  tipo: EjecucionKey;
  /** Registros iniciales; la vista los refresca desde EJECUCION_LOG al montarse. */
  registros?: EjecucionLog[];
}

export default function EjecucionView({ tipo, registros = [] }: EjecucionViewProps) {
  const user = useCurrentUser();
  const [executionLogs, setExecutionLogs] = useState<EjecucionLog[]>(registros);
  const Form = FORMS[tipo];

  useEffect(() => {
    let active = true;
    void listarEjecuciones(tipo).then((result) => {
      if (active && result.ok) setExecutionLogs(result.data.ejecuciones);
    });
    return () => {
      active = false;
    };
  }, [tipo]);

  function handleExecutionLogChange(log: EjecucionLog) {
    setExecutionLogs((current) => [log, ...current.filter((item) => item.id !== log.id)]);
  }

  return (
    <>
      {/* ── Tarjeta principal con pestañas + formulario ── */}
      <div className="card p-5">
        <EjecucionTabs />

        <h3 className="text-sm font-semibold mb-1">{EJECUCION_LABELS[tipo]}</h3>
        <p className="text-xs text-zinc-500 mb-4">{DESCRIPCIONES[tipo]}</p>

        {/* Contexto de compañía */}
        <div className="flex items-center gap-2 mb-4 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-zinc-400 inline-block" />
            Compañía:
            <span className="font-semibold text-zinc-700">
              {user.compania ?? <span className="italic text-zinc-400">Sin asignar</span>}
            </span>
          </span>
          <span className="text-zinc-300">·</span>
          <span>
            Usuario:{" "}
            <span className="font-semibold text-zinc-700">{user.nombre}</span>
          </span>
        </div>

        {/* Aviso de integración pendiente */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800 mb-4 flex items-start gap-2">
          <span className="mt-0.5 text-amber-500">⚠</span>
          <span>
            Este módulo está en construcción. Los formularios son el cuerpo visual;
            la ejecución real de SPs estará disponible al completar el{" "}
            <span className="font-semibold">PASO 4</span> de integración con Softland.
          </span>
        </div>

        {/* Formulario del tipo activo */}
        {tipo === "EJECUCION_PRECIOS" ? (
          <PreciosForm onExecutionLogChange={handleExecutionLogChange} />
        ) : (
          <Form />
        )}
      </div>

      {/* ── Tabla de últimas ejecuciones ── */}
      <UltimasEjecuciones registros={executionLogs} tipoActivo={tipo} />
    </>
  );
}
