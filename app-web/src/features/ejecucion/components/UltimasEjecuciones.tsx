"use client";

import type { EjecucionKey, EjecucionLog, EstadoEjecucion } from "@/lib/domain-types";
import { EJECUCION_LABELS } from "../routes";

// ─── Badge de estado ────────────────────────────────────────────────────────

const ESTADO_STYLES: Record<EstadoEjecucion, { cls: string; label: string }> = {
  PENDIENTE:              { cls: "badge-pendiente",  label: "Pendiente"             },
  EN_PROCESO:             { cls: "badge-enproceso",  label: "En proceso"            },
  COMPLETADO:             { cls: "badge-aprobado",   label: "Completado"            },
  COMPLETADO_CON_ERRORES: { cls: "badge-conerrores", label: "Completado c/ errores" },
  ERROR:                  { cls: "badge-error",      label: "Error"                 },
};

function EstadoEjecucionBadge({ estado }: { estado: EstadoEjecucion }) {
  const { cls, label } = ESTADO_STYLES[estado] ?? { cls: "badge-outline", label: estado };
  return (
    <span className={`badge ${cls}`}>
      {estado === "EN_PROCESO" && <span className="dot dot-pulse" style={{ background: "currentColor" }} />}
      {label}
    </span>
  );
}

// ─── Tabla por tipo ──────────────────────────────────────────────────────────

function TablaEjecuciones({
  tipo,
  registros,
}: {
  tipo: EjecucionKey;
  registros: EjecucionLog[];
}) {
  const label = EJECUCION_LABELS[tipo];
  const filtrados = registros.filter((r) => r.tipo === tipo);

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-700 mb-2 flex items-center gap-2">
        <span className="badge badge-outline">{label}</span>
        <span className="text-zinc-400 font-normal text-xs">
          {filtrados.length === 0 ? "Sin ejecuciones registradas" : `${filtrados.length} registro${filtrados.length !== 1 ? "s" : ""}`}
        </span>
      </h3>

      {filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-xs text-zinc-400">
          No hay ejecuciones de tipo <span className="font-medium">{label}</span> aún.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500">
                <th className="text-left px-3 py-2 font-medium">ID</th>
                <th className="text-left px-3 py-2 font-medium">Compañía</th>
                <th className="text-left px-3 py-2 font-medium">Ejecutado por</th>
                <th className="text-left px-3 py-2 font-medium">Inicio</th>
                <th className="text-left px-3 py-2 font-medium">Fin</th>
                <th className="text-left px-3 py-2 font-medium">Estado</th>
                <th className="text-right px-3 py-2 font-medium">Total</th>
                <th className="text-right px-3 py-2 font-medium">OK</th>
                <th className="text-right px-3 py-2 font-medium">Error</th>
                <th className="text-left px-3 py-2 font-medium">ID Proceso SP</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r, i) => (
                <tr
                  key={r.id}
                  className={
                    "border-b border-zinc-100 last:border-0 transition-colors hover:bg-zinc-50 " +
                    (r.estado === "ERROR" || r.estado === "COMPLETADO_CON_ERRORES" ? "row-alert" : "")
                  }
                >
                  <td className="px-3 py-2 font-medium mono">{r.id}</td>
                  <td className="px-3 py-2">{r.compania}</td>
                  <td className="px-3 py-2 max-w-[160px] truncate" title={r.ejecutadoPorEmail}>
                    {r.ejecutadoPor}
                  </td>
                  <td className="px-3 py-2 mono text-zinc-500 whitespace-nowrap">{r.fechaInicio}</td>
                  <td className="px-3 py-2 mono text-zinc-500 whitespace-nowrap">{r.fechaFin ?? "—"}</td>
                  <td className="px-3 py-2">
                    <EstadoEjecucionBadge estado={r.estado} />
                  </td>
                  <td className="px-3 py-2 text-right">{r.totalArticulos}</td>
                  <td className="px-3 py-2 text-right text-green-700 font-medium">{r.exitosos}</td>
                  <td className="px-3 py-2 text-right text-red-600 font-medium">{r.fallidos}</td>
                  <td className="px-3 py-2 mono text-zinc-400">{r.idProcesoSP ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Panel principal ─────────────────────────────────────────────────────────

interface UltimasEjecucionesProps {
  registros: EjecucionLog[];
  tipoActivo: EjecucionKey;
}

export default function UltimasEjecuciones({ registros, tipoActivo }: UltimasEjecucionesProps) {
  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold mb-1">Últimas ejecuciones</h2>
      <p className="text-xs text-zinc-500 mb-4">
        Tipo activo: <span className="font-medium">{EJECUCION_LABELS[tipoActivo]}</span>
      </p>
      <div className="flex flex-col gap-6">
        <TablaEjecuciones tipo={tipoActivo} registros={registros} />
      </div>
    </div>
  );
}
