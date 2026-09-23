"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Icon from "./Icon";
import { EstadoBadge } from "./Badges";
import { PROCESOS } from "@/lib/catalog";
import type { Identidad, ProcesoKey, Solicitud } from "@/lib/domain-types";
import ResponsiveDataTable, { type TableColumn, type TableLoadParams } from "./newComponents/ResponsiveDataTable";

const PAGE_SIZE = 10;

interface MisSolicitudesProps {
  solicitudes: Solicitud[];
  currentUser: Identidad;
  procesoFiltro: ProcesoKey;
  onVerDetalle: (id: string) => void;
  onCancelar?: (id: string, motivo: string) => void;
  onEnviarBorrador?: (id: string) => void;
  onRetomar?: (id: string) => void;
}

export default function MisSolicitudes({ solicitudes, currentUser, procesoFiltro, onVerDetalle, onCancelar, onEnviarBorrador, onRetomar }: MisSolicitudesProps) {
  const solicitudesSeguras = useMemo(
    () => (Array.isArray(solicitudes) ? solicitudes : []),
    [solicitudes],
  );
  const propias = useMemo(
    () => solicitudesSeguras.filter((s) => s.solicitanteEmail === currentUser.email && s.proceso === procesoFiltro),
    [solicitudesSeguras, currentUser.email, procesoFiltro],
  );
  
  const [displayedRows, setDisplayedRows] = useState<Solicitud[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const previousCountRef = useRef(0);
  const previousProcesoRef = useRef(procesoFiltro);

  useEffect(() => {
    const totalSolicitudes = propias.length;

    // Ordena por fecha descendente (más reciente primero)
    const porFechaDesc = (a: Solicitud, b: Solicitud) => {
      const ts = (s: Solicitud) => {
        if (s.fechaCreacion) return new Date(s.fechaCreacion).getTime();
        return 0;
      };
      return ts(b) - ts(a);
    };

    if (previousProcesoRef.current !== procesoFiltro) {
      previousProcesoRef.current = procesoFiltro;
      previousCountRef.current = totalSolicitudes;
      setDisplayedRows(propias.slice(0, PAGE_SIZE).sort(porFechaDesc));
      return;
    }

    setDisplayedRows((prev) => {
      // Primera carga real
      if (prev.length === 0 && totalSolicitudes > 0) {
        previousCountRef.current = totalSolicitudes;
        return propias.slice(0, PAGE_SIZE).sort(porFechaDesc);
      }
      // Refrescar estados de filas ya visibles
      const actualizadas = prev.map((fila) => propias.find((s) => s.id === fila.id) ?? fila);
      // Agregar solicitudes nuevas (que no estaban en pantalla) al inicio
      const idsActuales = new Set(prev.map((s) => s.id));
      const nuevas = propias.filter((s) => !idsActuales.has(s.id));
      previousCountRef.current = totalSolicitudes;
      const combinadas = nuevas.length > 0 ? [...nuevas, ...actualizadas] : actualizadas;
      return combinadas.sort(porFechaDesc);
    });
  }, [propias]);

  const handleLoadMore = useCallback(async (params: TableLoadParams) => {
    // Validación: no cargar si ya tenemos todos los registros
    // Usa los datos crudos sin depender de displayedRows para evitar re-renders
    if (params.offset >= propias.length) {
      return;
    }

    setIsLoading(true);
    try {
      // Simular delay de carga
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      const newRows = propias.slice(params.offset, params.offset + params.limit);
      if (newRows.length > 0) {
        setDisplayedRows((prev) => [...prev, ...newRows]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [propias]);

  const columns: readonly TableColumn<Solicitud>[] = [
    {
      key: "id",
      header: "ID",
      value: (s) => <span className="mono font-medium">{s.id}</span>,
      cellClass: "font-medium",
    },
    {
      key: "proceso",
      header: "Proceso",
      value: (s) => {
        const labelProceso = PROCESOS[s.proceso]?.label || s.proceso?.replace(/_/g, " ");
        return <span className="badge badge-outline">{labelProceso}</span>;
      },
    },
    {
      key: "compania",
      header: "Compañía",
      value: (s) => <span>{s.compania}</span>,
    },
    {
      key: "fechaEnvio",
      header: "Fecha",
      value: (s) => <span className="mono text-zinc-500">{s.fechaEnvio}</span>,
    },
    {
      key: "estado",
      header: "Estado",
      value: (s) => <EstadoBadge estado={s.estado} />,
    },
    {
      key: "detalle",
      header: "Detalle",
      value: (s) => (
        <span className="text-xs text-zinc-500">
          {s.estado === "RECHAZADO" ? s.motivoRechazo : s.estado === "EN_PROCESO" ? `Trabajo en segundo plano (${s.idProcesoSP})` : s.idProcesoSP || "—"}
        </span>
      ),
    },
    {
      key: "accion",
      header: "Acción",
      value: (s) => (
        <div className="flex items-center gap-2 flex-wrap">
          {s.estado === "BORRADOR" && onRetomar ? (
            <>
              <button
                className="btn btn-default btn-sm"
                onClick={() => onRetomar(s.id)}
                title="Retomar este borrador para editarlo y enviarlo"
              >
                <Icon name="fileEdit" className="w-3.5 h-3.5" /> Retomar
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => onVerDetalle(s.id)}>
                Ver detalle
              </button>
            </>
          ) : (
            <button className="btn btn-outline btn-sm" onClick={() => onVerDetalle(s.id)}>
              {s.estado === "EN_PROCESO" ? "Consultar avance" : "Ver detalle"}
            </button>
          )}
          {onCancelar && s.estado === "PENDIENTE" && (
            <button
              className="btn btn-ghost btn-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                const motivo = window.prompt("Motivo de cancelación (obligatorio):");
                if (motivo && motivo.trim().length > 0) onCancelar(s.id, motivo.trim());
              }}
              title="Solicitar cancelación"
            >
              Cancelar
            </button>
          )}
        </div>
      ),
    },
  ];

  const hasMore = displayedRows.length < propias.length;
  const nextOffset = displayedRows.length;
  const columnasSinAcciones = columns.filter((column) => column.key !== "accion");

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold mb-1">Mis solicitudes enviadas</h2>
      <p className="text-xs text-zinc-500 mb-3">Tipo: {PROCESOS[procesoFiltro]?.label ?? procesoFiltro}</p>
      <ResponsiveDataTable<Solicitud>
        rows={displayedRows}
        columns={columnasSinAcciones}
        rowKey={(s) => s.id}
        loading={false}
        loadingMore={isLoading}
        hasMore={hasMore}
        nextOffset={nextOffset}
        onLoadMore={handleLoadMore}
        onRowActivate={(s) => onVerDetalle(s.id)}
        emptyTitle="No hay solicitudes"
        emptyDescription="Aún no ha enviado solicitudes en esta sesión."
      />
    </div>
  );
}
