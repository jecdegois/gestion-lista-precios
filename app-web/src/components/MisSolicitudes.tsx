"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { EstadoBadge } from "./Badges";
import { PROCESOS } from "@/lib/catalog";
import type { Identidad, Solicitud } from "@/lib/domain-types";
import ResponsiveDataTable, { type TableColumn, type TableLoadParams } from "./newComponents/ResponsiveDataTable";

const PAGE_SIZE = 10;

interface MisSolicitudesProps {
  solicitudes: Solicitud[];
  currentUser: Identidad;
  onVerDetalle: (id: string) => void;
}

export default function MisSolicitudes({ solicitudes, currentUser, onVerDetalle }: MisSolicitudesProps) {
  const solicitudesSeguras = Array.isArray(solicitudes) ? solicitudes : [];
  const propias = solicitudesSeguras.filter((s) => s.solicitanteEmail === currentUser.email);
  
  const [displayedRows, setDisplayedRows] = useState<Solicitud[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const previousCountRef = useRef(0);

  // Solo resetea si hay nuevas solicitudes (nueva solicitud creada)
  // No resetea si solo cambiaron estados de solicitudes existentes
  useEffect(() => {
    const totalSolicitudes = propias.length;
    
    // Primera carga: mostrar primeros PAGE_SIZE
    if (previousCountRef.current === 0 && totalSolicitudes > 0) {
      setDisplayedRows(propias.slice(0, PAGE_SIZE));
      previousCountRef.current = totalSolicitudes;
      return;
    }

    // Si hay nuevas solicitudes: agregar al inicio sin resetear
    if (totalSolicitudes > previousCountRef.current) {
      const nuevas = propias.slice(0, totalSolicitudes - previousCountRef.current);
      setDisplayedRows((prev) => [...nuevas, ...prev].slice(0, prev.length + nuevas.length));
      previousCountRef.current = totalSolicitudes;
    }
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
        <button className="btn btn-outline btn-sm" onClick={() => onVerDetalle(s.id)}>
          {s.estado === "EN_PROCESO" ? "Consultar avance" : "Ver detalle"}
        </button>
      ),
    },
  ];

  const hasMore = displayedRows.length < propias.length;
  const nextOffset = displayedRows.length;

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold mb-3">Mis solicitudes enviadas</h2>
      <ResponsiveDataTable<Solicitud>
        rows={displayedRows}
        columns={columns}
        rowKey={(s) => s.id}
        loading={false}
        loadingMore={isLoading}
        hasMore={hasMore}
        nextOffset={nextOffset}
        onLoadMore={handleLoadMore}
        emptyTitle="No hay solicitudes"
        emptyDescription="Aún no ha enviado solicitudes en esta sesión."
      />
    </div>
  );
}
