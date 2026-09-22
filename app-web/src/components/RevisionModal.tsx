"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { EstadoBadge } from "./Badges";
import TablaResultadoModal from "./newComponents/TablaResultadoModal";
import TablaImpactoGestionGlobal from "./newComponents/TablaImpactoGestionGlobal";
import { esHallazgoDeNegocio } from "./Tablas";
import type { TableLoadParams } from "./newComponents/ResponsiveDataTable";
import { PROCESOS } from "@/lib/catalog";
import { textoResultadoAuditoria } from "@/lib/events";
import type { FilaPrecio, Identidad, Solicitud } from "@/lib/domain-types";

function pasoDeEstado(estado: string): number {
  if (estado === "BORRADOR" || estado === "CANCELACION_SOLICITADA" || estado === "CANCELADO") return 0;
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
  readOnly,
  onClose,
  onRechazar,
  onAprobar,
  onCancelar,
  onDecidirCancelacion,
  onRetomar,
  onEnviarBorrador,
}: {
  solicitud: Solicitud;
  currentUser: Identidad;
  readOnly: boolean;
  onClose: () => void;
  onRechazar: (id: string, motivo: string) => void;
  onAprobar: (id: string) => void;
  onCancelar?: (id: string, motivo: string) => void;
  onDecidirCancelacion?: (id: string, aprobada: boolean) => void;
  onRetomar?: (id: string) => void;
  onEnviarBorrador?: (id: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [filasDetalle, setFilasDetalle] = useState(solicitud.filas);
  const [detalleHasMore, setDetalleHasMore] = useState(false);
  const [detalleNextOffset, setDetalleNextOffset] = useState<number | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [hallazgosDetalle, setHallazgosDetalle] = useState<FilaPrecio[]>([]);
  const [hallazgosDetalleCargados, setHallazgosDetalleCargados] = useState(false);
  const [hallazgosHasMore, setHallazgosHasMore] = useState(false);
  const [hallazgosNextOffset, setHallazgosNextOffset] = useState<number | null>(null);
  const [cargandoHallazgos, setCargandoHallazgos] = useState(false);
  const offsetsDetalleEnCarga = useRef(new Set<number>());
  const offsetsHallazgosEnCarga = useRef(new Set<number>());

  const esGestionGlobal = solicitud.proceso === "FACTOR_PRECIO";
  const nivelConsulta = solicitud.lista?.trim() || solicitud.parametros.nivelPrecio?.trim() || solicitud.parametros.listaBase?.trim() || "";
  const factorConsulta = String(solicitud.parametros.factor ?? "");
  const tipoVariacionConsulta = solicitud.parametros.tipoVariacion === "DISMINUCION" ? "DISMINUCION" : "AUMENTO";
  useEffect(() => {
    setFilasDetalle(solicitud.filas);
    offsetsDetalleEnCarga.current.clear();
    setHallazgosDetalle([]);
    setHallazgosDetalleCargados(false);
    setHallazgosHasMore(false);
    setHallazgosNextOffset(null);
    offsetsHallazgosEnCarga.current.clear();
    // Las solicitudes nuevas de Gestión Global conservan la primera página
    // (máximo 200 filas); las páginas restantes se consultan bajo demanda.
    setDetalleHasMore(esGestionGlobal && solicitud.filas.length >= 200);
    setDetalleNextOffset(esGestionGlobal && solicitud.filas.length >= 200 ? solicitud.filas.length : null);
  }, [solicitud.id, solicitud.filas, esGestionGlobal]);

  const cargarDetalle = async ({ offset, limit }: TableLoadParams) => {
    if (!esGestionGlobal || cargandoDetalle || !detalleHasMore || offsetsDetalleEnCarga.current.has(offset)) return;
    if (!nivelConsulta) return;
    offsetsDetalleEnCarga.current.add(offset);
    setCargandoDetalle(true);
    try {
      const query = new URLSearchParams({
        compania: solicitud.compania,
        nivel: nivelConsulta,
        factor: factorConsulta,
        tipoVariacion: tipoVariacionConsulta,
        offset: String(offset),
        maxRecords: String(limit),
      });
      const response = await fetch(`/api/simulacion/gestion-global?${query.toString()}`);
      const pagina = await response.json() as {
        filas?: Solicitud["filas"];
        hasMore?: boolean;
        nextOffset?: number | null;
      };
      if (!response.ok || !Array.isArray(pagina.filas)) return;
      const filasPagina = pagina.filas.map((fila, index) => ({ ...fila, fila: offset + index + 1 }));
      setFilasDetalle((actuales) => [...actuales, ...filasPagina]);
      const siguienteOffset = pagina.nextOffset ?? null;
      const haySiguientePagina = Boolean(pagina.hasMore)
        && filasPagina.length > 0
        && siguienteOffset != null
        && siguienteOffset > offset;
      setDetalleHasMore(haySiguientePagina);
      setDetalleNextOffset(haySiguientePagina ? siguienteOffset : null);
    } catch (error) {
      console.error("No fue posible cargar la página del detalle de Gestión Global.", error);
    } finally {
      offsetsDetalleEnCarga.current.delete(offset);
      setCargandoDetalle(false);
    }
  };

  const cargarHallazgosDetalle = async ({ offset, limit }: TableLoadParams) => {
    if (!esGestionGlobal || cargandoHallazgos || offsetsHallazgosEnCarga.current.has(offset)) return;
    if (!nivelConsulta) return;
    offsetsHallazgosEnCarga.current.add(offset);
    setCargandoHallazgos(true);
    try {
      const query = new URLSearchParams({
        compania: solicitud.compania,
        nivel: nivelConsulta,
        factor: factorConsulta,
        tipoVariacion: tipoVariacionConsulta,
        soloHallazgos: "1",
        offset: String(offset),
        maxRecords: String(limit),
      });
      const response = await fetch(`/api/simulacion/gestion-global?${query.toString()}`, { cache: "no-store" });
      const pagina = await response.json() as {
        filas?: FilaPrecio[];
        hasMore?: boolean;
        nextOffset?: number | null;
      };
      if (!response.ok || !Array.isArray(pagina.filas)) return;
      const filasPagina = pagina.filas.map((fila, index) => ({ ...fila, fila: offset + index + 1 }));
      setHallazgosDetalle((actuales) => offset === 0 ? filasPagina : [...actuales, ...filasPagina]);
      setHallazgosDetalleCargados(true);
      const siguienteOffset = pagina.nextOffset ?? null;
      const haySiguientePagina = Boolean(pagina.hasMore)
        && filasPagina.length > 0
        && siguienteOffset != null
        && siguienteOffset > offset;
      setHallazgosHasMore(haySiguientePagina);
      setHallazgosNextOffset(haySiguientePagina ? siguienteOffset : null);
    } catch (error) {
      console.error("No fue posible cargar los hallazgos de Gestión Global.", error);
    } finally {
      offsetsHallazgosEnCarga.current.delete(offset);
      setCargandoHallazgos(false);
    }
  };

  useEffect(() => {
    if (!esGestionGlobal || !nivelConsulta) return;
    void cargarHallazgosDetalle({ offset: 0, limit: 50 });
  // La consulta se reinicia únicamente al cambiar la solicitud o sus parámetros.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitud.id, solicitud.compania, esGestionGlobal, nivelConsulta, factorConsulta, tipoVariacionConsulta]);

  const filas = filasDetalle;
  const puedeDecidir =
    !readOnly && currentUser.rol === "APROBADOR" && solicitud.estado === "PENDIENTE" && solicitud.solicitanteEmail !== currentUser.email;
  const puedeAprobar = puedeDecidir && filas.length > 0;
  const enProceso = solicitud.estado === "EN_PROCESO";
  const resultado = solicitud.resultado;

  // Cancelación: solicitante puede pedir cancelación de su propia solicitud PENDIENTE
  const puedeSolicitarCancelacion =
    !readOnly &&
    onCancelar != null &&
    currentUser.email === solicitud.solicitanteEmail &&
    solicitud.estado === "PENDIENTE";

  // Aprobador puede decidir si la cancelación fue solicitada
  const puedeDecidirCancelacion =
    !readOnly &&
    onDecidirCancelacion != null &&
    currentUser.rol === "APROBADOR" &&
    solicitud.estado === "CANCELACION_SOLICITADA";
  const esActualizacionListaBase = solicitud.proceso === "MAYOREOD_MASIVO";
  const esBorrador = solicitud.estado === "BORRADOR";
  const nivelListaBase = solicitud.parametros.nivelPrecio
    ?? solicitud.parametros.listaBase
    ?? solicitud.parametros.nivel
    ?? "—";
  const listaPrecio = solicitud.lista?.trim() || nivelListaBase;

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
              Solicitante: {solicitud.solicitanteNombre} · Compañía: {solicitud.compania} · Lista: {listaPrecio} · {solicitud.fechaEnvio}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}><Icon name="x" className="w-4 h-4" /></button>
        </div>

        <div className="mb-4"><SimuladorEstadoProceso estado={solicitud.estado} /></div>

        {/* Cards resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card label="Filas evaluadas" value={String(filas.length)} />
          <Card label="Con hallazgo" value={String(filas.filter(esHallazgoDeNegocio).length)} />
          <Card label="Lista de precios" value={listaPrecio} />
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
          esGestionGlobal ? (
            <TablaImpactoGestionGlobal
              filas={filas as FilaPrecio[]}
              hallazgos={hallazgosDetalleCargados ? hallazgosDetalle : undefined}
              hallazgosHasMore={hallazgosHasMore}
              hallazgosNextOffset={hallazgosNextOffset}
              hallazgosLoadingMore={cargandoHallazgos}
              onLoadMoreHallazgos={cargarHallazgosDetalle}
              hasMore={detalleHasMore}
              nextOffset={detalleNextOffset}
              loadingMore={cargandoDetalle}
              onLoadMore={cargarDetalle}
            />
          ) : (
            <TablaResultadoModal filas={filas} />
          )
        ) : (
          <p className="text-sm text-zinc-500">Esta solicitud no conserva el detalle de las filas.</p>
        )}

        {/* Acciones de cancelación — solicitante pide cancelar su propia solicitud PENDIENTE */}
        {puedeSolicitarCancelacion && (
          <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4">
            <p className="text-xs font-medium text-zinc-500">Solicitar cancelación</p>
            <textarea
              className="input"
              rows={2}
              value={motivoCancelacion}
              onChange={(e) => setMotivoCancelacion(e.target.value)}
              placeholder="Motivo de cancelación (obligatorio)"
            />
            <div className="flex justify-end">
              <button
                className="btn btn-outline"
                disabled={motivoCancelacion.trim().length === 0}
                onClick={() => { onCancelar!(solicitud.id, motivoCancelacion.trim()); onClose(); }}
              >
                <Icon name="xCircle" className="w-3.5 h-3.5" /> Solicitar cancelación
              </button>
            </div>
          </div>
        )}

        {/* Acciones para aprobador cuando hay cancelación pendiente */}
        {puedeDecidirCancelacion && (
          <div className="mt-4 space-y-2 border-t border-amber-100 pt-4 rounded-lg bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">Cancelación solicitada por el operador</p>
            {solicitud.motivoRechazo && (
              <p className="text-xs text-amber-800">Motivo: {solicitud.motivoRechazo}</p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                className="btn btn-outline"
                onClick={() => { onDecidirCancelacion!(solicitud.id, false); onClose(); }}
              >
                Denegar cancelación
              </button>
              <button
                className="btn btn-destructive"
                onClick={() => { onDecidirCancelacion!(solicitud.id, true); onClose(); }}
              >
                <Icon name="check" className="w-3.5 h-3.5" /> Confirmar cancelación
              </button>
            </div>
          </div>
        )}

        {/* Acciones del borrador */}
        {esBorrador ? (
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
            {onRetomar && (
              <button className="btn btn-default" onClick={() => { onClose(); onRetomar(solicitud.id); }}>
                <Icon name="fileEdit" className="w-3.5 h-3.5" /> Retomar borrador
              </button>
            )}
            {onEnviarBorrador && (
              <button className="btn btn-default" onClick={() => { onClose(); onEnviarBorrador(solicitud.id); }}>
                Enviar Solicitud
              </button>
            )}
            <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
          </div>
        ) : /* Acciones del aprobador: aprobar o rechazar */
        puedeDecidir ? (
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
