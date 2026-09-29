"use client";

import { useMemo, useState } from "react";
import Dropdown, { type SelectOption } from "@/components/newComponents/Dropdown";
import type { GestionGlobalLista } from "@/lib/types";
import type { EjecucionLog } from "@/lib/domain-types";
import { useGlobalManagementCatalog } from "@/features/solicitudes/hooks/useGlobalManagementCatalog";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import { actualizarEjecucion, crearEjecucion } from "@/features/ejecucion/api/ejecucion-api";

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

function buildExecute(lista: GestionGlobalLista, schema: string): string {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const dateTime = (value: string | null) => value ? `${value.slice(0, 10)} 00:00:00` : "";
  const decimal = lista.factorMultiplicador == null ? "NULL" : lista.factorMultiplicador.toFixed(8);
  const integer = lista.horasAtras == null ? "NULL" : String(lista.horasAtras);

  return [
    `EXEC [${schema}].[SP_GESTION_LISTAS_PRECIOS_PARCIAL] ${quote(lista.codigo)}, ${lista.fechaInicio ? quote(dateTime(lista.fechaInicio)) : "NULL"}, ${lista.fechaFin ? quote(dateTime(lista.fechaFin)) : "NULL"}, ${quote(lista.nivelPrecioBase)}, ${decimal}, ${integer}, ${Number.isFinite(Number(lista.version)) ? Number(lista.version) : "NULL"};`,
  ].join("\n");
}

/** Selecciona una lista de GESTION_LISTAS_PRECIOS y prepara el EXEC del SP parcial. */
export default function PreciosForm({ onExecutionLogChange }: { onExecutionLogChange?: (log: EjecucionLog) => void }) {
  const user = useCurrentUser();
  const { lists, loading, error } = useGlobalManagementCatalog();
  const [listaCodigo, setListaCodigo] = useState("");
  const [processing, setProcessing] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const selectedList = lists.find((lista) => lista.codigo === listaCodigo);

  const options = useMemo<SelectOption[]>(
    () => lists.map((lista) => ({ value: lista.codigo, label: lista.codigo })),
    [lists],
  );

  const executeReady = selectedList != null &&
    selectedList.fechaInicio != null &&
    selectedList.fechaFin != null &&
    selectedList.factorMultiplicador != null &&
    selectedList.horasAtras != null &&
    Number.isFinite(Number(selectedList.version));

  async function handleExecute() {
    if (!selectedList || !executeReady) return;
    const schema = (user.compania ?? "FEBECA").trim().toUpperCase();
    const execute = buildExecute(selectedList, schema);
    console.log(execute);
    setProcessing(true);
    setExecutionError(null);
    const start = await crearEjecucion({
      tipo: "EJECUCION_PRECIOS",
      parametros: {
        nivelPrecio: selectedList.codigo,
        fechaInicio: selectedList.fechaInicio,
        fechaCorte: selectedList.fechaFin,
        nivelPrecioBase: selectedList.nivelPrecioBase,
        factorMultiplicador: selectedList.factorMultiplicador,
        horasAtras: selectedList.horasAtras,
        version: selectedList.version,
        execute,
      },
      spNombre: "SP_GESTION_LISTAS_PRECIOS_PARCIAL",
      observaciones: `EXEC preparado para prueba; el SP no se invoca todavía.\n${execute}`,
    });
    if (!start.ok) {
      setProcessing(false);
      setExecutionError(start.error);
      return;
    }
    onExecutionLogChange?.(start.data.ejecucion);

    window.setTimeout(() => {
      void (async () => {
        const finish = await actualizarEjecucion(start.data.ejecucion.id, {
          estado: "COMPLETADO",
          totalArticulos: 0,
          exitosos: 0,
          fallidos: 0,
          observaciones: `Prueba completada; el SP no fue invocado. EXEC preparado:\n${execute}`,
        });
        if (finish.ok) onExecutionLogChange?.(finish.data.ejecucion);
        else setExecutionError(finish.error);
        setProcessing(false);
      })();
    }, 1800);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
        Selecciona una lista para consultar sus parámetros vigentes y preparar el `EXEC` de actualización parcial.
        La ejecución real permanece deshabilitada durante esta prueba.
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {executionError && <p className="text-xs text-red-600">{executionError}</p>}

      {processing && (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-800">
          <span className="spin h-4 w-4 rounded-full border-2 border-indigo-200 border-t-indigo-700" />
          <span>Procesando ejecución de Precios…</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Dropdown
          id="ejecucion-precios-lista"
          modelValue={listaCodigo}
          onChange={setListaCodigo}
          options={options}
          label="Lista de Precio"
          placeholder="Seleccionar lista..."
          searchable={false}
          disabled={processing}
          loading={loading}
        />
        <ReadOnlyField label="Nivel_Precio" value={displayValue(selectedList?.codigo)} />
        <ReadOnlyField label="Fecha_Inicio" value={displayValue(selectedList?.fechaInicio)} />
        <ReadOnlyField label="Fecha_Fin" value={displayValue(selectedList?.fechaFin)} />
        <ReadOnlyField label="Nivel_PrecioBase" value={displayValue(selectedList?.nivelPrecioBase)} />
        <ReadOnlyField
          label="Factor_Multiplicador"
          value={selectedList?.factorMultiplicador == null ? "—" : selectedList.factorMultiplicador.toFixed(8)}
        />
        <ReadOnlyField label="Version" value={displayValue(selectedList?.version)} />
        <ReadOnlyField label="Horas_Atras" value={displayValue(selectedList?.horasAtras)} />
      </div>

      <div className="flex items-center gap-3 border-t border-zinc-100 pt-4">
        <button className="btn btn-default" disabled={!executeReady || processing} onClick={handleExecute}>
          {processing ? "Procesando…" : "Ejecutar simulación"}
        </button>
        <span className="text-[11px] text-zinc-400">Se registra en el log local y se escribe en la consola.</span>
      </div>
    </div>
  );
}
