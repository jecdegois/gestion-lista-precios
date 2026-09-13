"use client";

import { useState } from "react";
import Icon from "./Icon";
import { EstadoBadge } from "./Badges";
import { TablaResultado } from "./Tablas";
import { PROCESOS } from "@/lib/catalog";
import { textoResultadoAuditoria } from "@/lib/events";
import type { Identidad, Solicitud } from "@/lib/domain-types";

function pasoDeEstado(estado: string): number {
  if (estado === "PENDIENTE") return 0;
  if (estado === "EN_PROCESO") return 1;
  return 2;
}

function SimuladorEstadoProceso({ estado }: { estado: string }) {
  const paso = pasoDeEstado(estado);
  const esError = estado === "ERROR_EJECUCION";
  const pasos = ["Pendiente", "En proceso", esError ? "Error" : "Completado"];
  return (
    <div className="flex items-center gap-2">
      {pasos.map((p, i) => {
        const activo = i === paso;
        const completado = i < paso;
        const color = esError && i === 2 ? "#DC2626" : completado ? "#15803D" : activo ? "#4338CA" : "#d4d4d8";
        return (
          <div key={p} className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]" style={{ background: color }}>
              {i + 1}
            </span>
            <span className="text-xs text-zinc-600">{p}</span>
            {i < pasos.length - 1 && <span className="w-6 h-px bg-zinc-300" />}
          </div>
        );
      })}
    </div>
  );
}

export default function RevisionModal({
  solicitud,
  currentUser,
  onClose,
  onRechazar,
  onAprobar,
}: {
  solicitud: Solicitud;
  currentUser: Identidad;
  onClose: () => void;
  onRechazar: (id: string, motivo: string) => void;
  onAprobar: (id: string) => void;
}) {
  const [motivo, setMotivo] = useState("");

  const filas = solicitud.filas;
  const puedeDecidir =
    currentUser.rol === "APROBADOR" && solicitud.estado === "PENDIENTE" && solicitud.solicitanteEmail !== currentUser.email;
  const puedeAprobar = puedeDecidir && filas.length > 0;
  const enProceso = solicitud.estado === "EN_PROCESO";
  const resultado = solicitud.resultado;
  const esActualizacionListaBase = solicitud.proceso === "MAYOREOD_MASIVO";
  const nivelListaBase = solicitud.parametros.nivelPrecio
    ?? solicitud.parametros.listaBase
    ?? solicitud.parametros.nivel
    ?? "—";

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono text-sm font-semibold">{solicitud.id}</span>
              <span className="badge badge-outline">{PROCESOS[solicitud.proceso].label}</span>
              <EstadoBadge estado={solicitud.estado} />
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Solicitante: {solicitud.solicitanteNombre} · Compañía: {solicitud.compania} · {solicitud.fechaEnvio}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}><Icon name="x" className="w-4 h-4" /></button>
        </div>

        <div className="mb-4"><SimuladorEstadoProceso estado={solicitud.estado} /></div>

        {/* Cards resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card label="Filas evaluadas" value={String(filas.length)} />
          <Card label="Con hallazgo" value={String(filas.filter((f) => !f.validacion.valido).length)} />
          <Card label="Modalidad" value={solicitud.modalidad} />
          <Card label="Ejecución" value={PROCESOS[solicitud.proceso].ejecucion} />
        </div>

        {esActualizacionListaBase && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-800 mb-4">
            Impacto directo sobre la lista maestra {nivelListaBase}.
          </div>
        )}

        {/* Fase monitoreo */}
        {enProceso && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 mb-4">
            <p className="text-sm text-indigo-900 font-medium">Procesamiento en segundo plano · {solicitud.idProcesoSP}</p>
            <div className="progress-track mt-2"><div className="progress-fill progress-indeterminate" /></div>
            <p className="text-[11px] text-indigo-700 mt-1">Última actualización: {solicitud.ultimaActualizacion ?? "—"}</p>
          </div>
        )}

        {/* Fase resultado */}
        {resultado && (
          <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3 mb-4">
            <p className="text-sm font-medium mb-2">{textoResultadoAuditoria(resultado.estadoFinal, resultado.exitosos, resultado.fallidos)}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card label="ID de procesamiento" value={solicitud.idProcesoSP ?? "—"} />
              <Card label="Autorizado por" value={resultado.aprobadoPor} />
              <Card label="Filas exitosas" value={String(resultado.exitosos)} />
              <Card label="Filas con error" value={String(resultado.fallidos)} />
            </div>
            <p className="text-[10px] text-zinc-400 mt-2 mono">s3://{resultado.logS3Key}</p>
          </div>
        )}

        {/* Diff / tabla */}
        {filas.length > 0 ? (
          <TablaResultado filas={filas} />
        ) : (
          <p className="text-sm text-zinc-500">Esta solicitud no conserva el detalle de las filas.</p>
        )}

        {/* Acciones */}
        {puedeDecidir ? (
          <div className="mt-5 space-y-3 border-t border-zinc-100 pt-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Motivo de rechazo *</label>
              <textarea className="input" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Obligatorio para rechazar" />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button className="btn btn-outline" disabled={motivo.trim().length === 0} onClick={() => { onRechazar(solicitud.id, motivo.trim()); onClose(); }}>
                Rechazar
              </button>
              <button className="btn btn-destructive" disabled={!puedeAprobar} onClick={() => { onAprobar(solicitud.id); onClose(); }}>
                <Icon name="check" className="w-3.5 h-3.5" /> Procesar Solicitud
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex justify-end border-t border-zinc-100 pt-4">
            <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-2.5">
      <p className="text-[10px] text-zinc-400">{label}</p>
      <p className="text-xs font-medium truncate" title={value}>{value}</p>
    </div>
  );
}
