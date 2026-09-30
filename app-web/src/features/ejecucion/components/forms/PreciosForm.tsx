"use client";

import { useMemo, useState } from "react";
import Dropdown, { type SelectOption } from "@/components/newComponents/Dropdown";
import type { EjecucionLog } from "@/lib/domain-types";
import { useGlobalManagementCatalog } from "@/features/solicitudes/hooks/useGlobalManagementCatalog";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import { ejecutarPrecios } from "@/features/ejecucion/api/ejecucion-api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-zinc-500">{label}</label>
      <input className="input bg-zinc-50" value={value} readOnly aria-readonly="true" />
    </div>
  );
}

function displayValue(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

// ─── Modal de confirmacion ────────────────────────────────────────────────────

interface ConfirmModalProps {
  nivelPrecio: string;
  nivelPrecioBase: string;
  factor: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ nivelPrecio, nivelPrecioBase, factor, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-base font-semibold text-zinc-900">
          Confirmar ejecucion
        </h2>
        <p className="text-sm text-zinc-600">
          Se ejecutara <span className="font-medium text-zinc-800">SP_GESTION_LISTAS_PRECIOS_FULL</span> con los siguientes parametros:
        </p>
        <ul className="text-xs text-zinc-700 bg-zinc-50 rounded-lg border border-zinc-200 divide-y divide-zinc-100">
          <li className="flex justify-between px-3 py-2">
            <span className="text-zinc-500">Lista de Precio</span>
            <span className="font-medium">{nivelPrecio}</span>
          </li>
          <li className="flex justify-between px-3 py-2">
            <span className="text-zinc-500">Nivel_PrecioBase</span>
            <span className="font-medium">{nivelPrecioBase}</span>
          </li>
          <li className="flex justify-between px-3 py-2">
            <span className="text-zinc-500">Factor_Multiplicador</span>
            <span className="font-medium font-mono">{factor}</span>
          </li>
        </ul>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Esta accion modificara precios en Softland. No se puede deshacer.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn btn-default" onClick={onConfirm}>
            Confirmar ejecucion
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Formulario principal ─────────────────────────────────────────────────────

export default function PreciosForm({ onExecutionLogChange }: { onExecutionLogChange?: (log: EjecucionLog) => void }) {
  const user = useCurrentUser();
  const { lists, loading, error } = useGlobalManagementCatalog();
  const [listaCodigo, setListaCodigo]       = useState("");
  const [processing, setProcessing]         = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [lastResult, setLastResult]         = useState<{ filasAfectadas: number; lista: string } | null>(null);

  const selectedList = lists.find((l) => l.codigo === listaCodigo);

  const options = useMemo<SelectOption[]>(
    () => lists.map((l) => ({ value: l.codigo, label: l.codigo })),
    [lists],
  );

  const executeReady =
    selectedList != null &&
    selectedList.fechaInicio != null &&
    selectedList.fechaFin != null &&
    selectedList.factorMultiplicador != null &&
    Number.isFinite(Number(selectedList.version));

  // Se llama luego de que el usuario confirma en el modal
  async function handleConfirm() {
    setShowConfirm(false);
    if (!selectedList || !executeReady) return;

    // Log del EXEC en consola para trazabilidad de desarrollo
    const schema = (user.compania ?? "FEBECA").trim().toUpperCase();
    const q  = (v: string) => `'${v.replace(/'/g, "''")}'`;
    const qn = (v: string | null | undefined) => v ? q(v) : "NULL";
    const bit = (v: boolean) => v ? "1" : "0";
    const execStr =
      `EXEC [${schema}].[SP_GESTION_LISTAS_PRECIOS_FULL]` +
      ` ${q(selectedList.codigo)},` +
      ` ${qn(selectedList.moneda)},` +
      ` ${q(selectedList.fechaInicio!)},` +
      ` ${q(selectedList.fechaFin!)},` +
      ` ${q(selectedList.nivelPrecioBase)},` +
      ` ${qn(selectedList.monedaBase)},` +
      ` ${selectedList.factorMultiplicador!.toFixed(8)},` +
      ` ${Number(selectedList.version)},` +
      ` ${q(user.nombre)},` +           // @p_usuario_ult_modif
      ` ${bit(selectedList.validarPrecioBajoCosto)},` +
      ` ${bit(selectedList.exigirFactorConfigurado)},` +
      ` ${selectedList.excepcionesArticulos == null ? "NULL" : `'${selectedList.excepcionesArticulos.replace(/'/g, "''")}'`},` +
      ` ${bit(selectedList.validarPrecioBajoMargenMin)};`;
    console.log("[PreciosForm] EXEC →", execStr);

    setProcessing(true);
    setExecutionError(null);
    setLastResult(null);

    const result = await ejecutarPrecios({
      nivelPrecio:                selectedList.codigo,
      moneda:                     selectedList.moneda ?? null,
      fechaInicio:                selectedList.fechaInicio!,
      fechaFin:                   selectedList.fechaFin!,
      nivelPrecioBase:            selectedList.nivelPrecioBase,
      monedaBase:                 selectedList.monedaBase ?? null,
      factorMultiplicador:        selectedList.factorMultiplicador!,
      version:                    Number(selectedList.version),
      validarPrecioBajoCosto:     selectedList.validarPrecioBajoCosto,
      exigirFactorConfigurado:    selectedList.exigirFactorConfigurado,
      excepcionesArticulos:       selectedList.excepcionesArticulos,
      validarPrecioBajoMargenMin: selectedList.validarPrecioBajoMargenMin,
    });

    setProcessing(false);

    if (!result.ok) {
      setExecutionError(result.error ?? "Error desconocido al ejecutar el SP.");
    }

    // Tanto en OK como en ERROR el log fue persistido; actualizamos la tabla
    if ("data" in result && result.data?.ejecucion) {
      const log = result.data.ejecucion;
      onExecutionLogChange?.(log);
      if (result.ok) {
        setLastResult({ filasAfectadas: log.totalArticulos, lista: selectedList.codigo });
      }
    }
  }

  return (
    <>
      {showConfirm && selectedList && (
        <ConfirmModal
          nivelPrecio={selectedList.codigo}
          nivelPrecioBase={selectedList.nivelPrecioBase}
          factor={selectedList.factorMultiplicador?.toFixed(8) ?? "—"}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      <div className="flex flex-col gap-5">
        {error && <p className="text-xs text-red-600">{error}</p>}

        {executionError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            <span className="font-medium">Error al ejecutar el SP:</span> {executionError}
          </div>
        )}

        {lastResult && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-800 flex items-center gap-2">
            <span className="text-green-500 text-base leading-none">✓</span>
            <span>
              SP ejecutado correctamente para <span className="font-medium">{lastResult.lista}</span>.{" "}
              Filas afectadas: <span className="font-semibold">{lastResult.filasAfectadas}</span>.
            </span>
          </div>
        )}

        {processing && (
          <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-800">
            <span className="spin h-4 w-4 rounded-full border-2 border-indigo-200 border-t-indigo-700" />
            <span>Ejecutando SP_GESTION_LISTAS_PRECIOS_FULL...</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Dropdown
            id="ejecucion-precios-lista"
            modelValue={listaCodigo}
            onChange={(val) => { setListaCodigo(val); setExecutionError(null); }}
            options={options}
            label="Lista de Precio"
            placeholder="Seleccionar lista..."
            searchable={false}
            disabled={processing}
            loading={loading}
          />
          <ReadOnlyField label="Nivel_PrecioBase"    value={displayValue(selectedList?.nivelPrecioBase)} />
          <ReadOnlyField
            label="Factor_Multiplicador"
            value={selectedList?.factorMultiplicador == null ? "—" : selectedList.factorMultiplicador.toFixed(8)}
          />
        </div>

        <div className="flex items-center gap-3 border-t border-zinc-100 pt-4">
          <button
            className="btn btn-default"
            disabled={!executeReady || processing}
            onClick={() => { setExecutionError(null); setShowConfirm(true); }}
          >
            {processing ? "Ejecutando..." : "Ejecutar"}
          </button>
        </div>
      </div>
    </>
  );
}
