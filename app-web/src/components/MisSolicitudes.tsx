"use client";

import { useMemo } from "react";
import Icon from "./Icon";
import { EstadoBadge } from "./Badges";
import { PROCESOS } from "@/lib/catalog";
import type { Identidad, ProcesoKey, Solicitud } from "@/lib/domain-types";
import ResponsiveDataTable, { type TableColumn, type TableLoadParams } from "./newComponents/ResponsiveDataTable";

interface MisSolicitudesProps {
  solicitudes: Solicitud[];
  currentUser: Identidad;
  procesoFiltro: ProcesoKey;
  onVerDetalle: (id: string) => void;
  onCancelar?: (id: string, motivo: string) => void;
  onEnviarBorrador?: (id: string) => void;
  onRetomar?: (id: string) => void;
  /** Hay más páginas disponibles en el servidor. */
  hasMore?: boolean;
  /** Cargando más registros del servidor. */
  loadingMore?: boolean;
  /** Offset de la próxima página (viene del servidor). */
  nextOffset?: number | null;
  /** Llama al padre para cargar la siguiente página. */
  onLoadMore?: () => void;
}

export default function MisSolicitudes({
  solicitudes,
  currentUser,
  procesoFiltro,
  onVerDetalle,
  onCancelar,
  onEnviarBorrador,
  onRetomar,
  hasMore = false,
  loadingMore = false,
  nextOffset = null,
  onLoadMore,
}: MisSolicitudesProps) {
  // El server ya filtra por proceso; filtramos por email en cliente por seguridad.
  const propias = useMemo(
    () => (Array.isArray(solicitudes) ? solicitudes : []).filter(
      (s) => s.solicitanteEmail === currentUser.email,
    ),
    [solicitudes, currentUser.email],
  );

  function handleLoadMore({ offset: _offset, limit: _limit }: TableLoadParams) {
    onLoadMore?.();
  }

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
          {s.estado === "RECHAZADO"
            ? s.motivoRechazo
            : s.estado === "EN_PROCESO"
              ? `Trabajo en segundo plano (${s.idProcesoSP})`
              : s.idProcesoSP || "—"}
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

  const columnasSinAcciones = columns.filter((c) => c.key !== "accion");

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold mb-1">Mis solicitudes enviadas</h2>
      <p className="text-xs text-zinc-500 mb-3">Tipo: {PROCESOS[procesoFiltro]?.label ?? procesoFiltro}</p>
      <ResponsiveDataTable<Solicitud>
        rows={propias}
        columns={columnasSinAcciones}
        rowKey={(s) => s.id}
        loading={false}
        loadingMore={loadingMore}
        hasMore={hasMore}
        nextOffset={nextOffset ?? propias.length}
        onLoadMore={handleLoadMore}
        onRowActivate={(s) => onVerDetalle(s.id)}
        emptyTitle="No hay solicitudes"
        emptyDescription="Aún no ha enviado solicitudes en esta sesión."
      />
      {hasMore && (
        <div className="mt-2 flex justify-center">
          <button
            className="btn btn-outline"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? "Cargando..." : "Cargar más"}
          </button>
        </div>
      )}
    </div>
  );
}
