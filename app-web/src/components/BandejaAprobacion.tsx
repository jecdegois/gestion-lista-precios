"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Icon from "./Icon";
import { EstadoBadge } from "./Badges";
import Dropdown, { type SelectOption } from "./newComponents/Dropdown";
import { PROCESOS, estaEnAmbito } from "@/lib/catalog";
import type { EstadoSolicitud, Identidad, ProcesoKey, Solicitud } from "@/lib/domain-types";
import ResponsiveDataTable, { type TableColumn, type TableLoadParams } from "./newComponents/ResponsiveDataTable";

const PAGE_SIZE = 20;

const ESTADOS: (EstadoSolicitud | "TODOS")[] = [
  "TODOS",
  "PENDIENTE",
  "EN_PROCESO",
  "PROCESADO",
  "PROCESADO_CON_ERRORES",
  "RECHAZADO",
  "ERROR_EJECUCION",
];

/** Formatea un timestamp ISO o una cadena de fecha de BD a formato legible local. */
function formatFechaBD(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString("es-CR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BandejaAprobacion({
  solicitudes,
  currentUser,
  readOnly,
  onAbrir,
}: {
  solicitudes: Solicitud[];
  currentUser: Identidad;
  readOnly: boolean;
  onAbrir: (id: string) => void;
}) {
  const [filtroEstado, setFiltroEstado] = useState<string>("TODOS");
  const [filtroProceso, setFiltroProceso] = useState<string>("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [displayedRows, setDisplayedRows] = useState<Solicitud[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const previousCountRef = useRef(0);

  const estadoOpts: SelectOption[] = ESTADOS.map((e) => ({
    value: e,
    label: e === "TODOS" ? "Todos los estados" : e,
  }));
  const procesoOpts: SelectOption[] = [
    { value: "TODOS", label: "Todos los procesos" },
    ...Object.keys(PROCESOS).map((k) => ({
      value: k,
      label: PROCESOS[k as ProcesoKey].label,
    })),
  ];

  /** Orden por más reciente primero usando fechaCreacion cuando está disponible. */
  const porFechaDesc = useCallback((a: Solicitud, b: Solicitud) => {
    const ts = (s: Solicitud) => {
      if (s.fechaCreacion) return new Date(s.fechaCreacion).getTime();
      if (s.fechaEnvio) return new Date(s.fechaEnvio).getTime();
      return 0;
    };
    return ts(b) - ts(a);
  }, []);

  const solicitudesSeguras = Array.isArray(solicitudes) ? solicitudes : [];

  /** Aplica los filtros actuales sobre el universo completo de solicitudes visibles. */
  const filtradasPorFiltros = solicitudesSeguras.filter((s) => {
    if (s.estado === "BORRADOR") return false;
    if (!estaEnAmbito(currentUser.compania, s.compania)) return false;
    if (filtroEstado !== "TODOS" && s.estado !== filtroEstado) return false;
    if (filtroProceso !== "TODOS" && s.proceso !== filtroProceso) return false;
    return true;
  });

  /** La búsqueda se ejecuta antes de paginar/cargar por scroll. */
  const consulta = normalizar(busqueda);
  const filtradas = filtradasPorFiltros.filter((s) => {
    if (!consulta) return true;
    return normalizar([
      s.id,
      s.proceso,
      PROCESOS[s.proceso]?.label,
      s.lista,
      s.compania,
      s.solicitanteNombre,
      s.solicitanteEmail,
      s.estado,
    ].filter(Boolean).join(" ")).includes(consulta);
  });

  /** Cuando cambian los filtros o llegan datos nuevos, recalcula las filas mostradas. */
  useEffect(() => {
    const total = filtradas.length;

    setDisplayedRows((prev) => {
      // Primera carga o reset por cambio de filtros
      if (prev.length === 0 || total !== previousCountRef.current) {
        previousCountRef.current = total;
        return filtradas.slice(0, PAGE_SIZE).sort(porFechaDesc);
      }
      // Refrescar estados de filas ya visibles sin perder el scroll
      const actualizadas = prev.map((fila) => filtradas.find((s) => s.id === fila.id) ?? fila);
      // Agregar solicitudes nuevas que no estaban en pantalla
      const idsActuales = new Set(prev.map((s) => s.id));
      const nuevas = filtradas.filter((s) => !idsActuales.has(s.id));
      previousCountRef.current = total;
      const combinadas = nuevas.length > 0 ? [...nuevas, ...actualizadas] : actualizadas;
      return combinadas.sort(porFechaDesc);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitudesSeguras, filtroEstado, filtroProceso, consulta]);

  const handleLoadMore = useCallback(
    async (params: TableLoadParams) => {
      if (params.offset >= filtradas.length) return;
      setIsLoadingMore(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const newRows = filtradas
          .slice()
          .sort(porFechaDesc)
          .slice(params.offset, params.offset + params.limit);
        if (newRows.length > 0) {
          setDisplayedRows((prev) => [...prev, ...newRows]);
        }
      } finally {
        setIsLoadingMore(false);
      }
    },
    [filtradas, porFechaDesc],
  );

  const hasMore = displayedRows.length < filtradas.length;
  const nextOffset = displayedRows.length;
  const columns: readonly TableColumn<Solicitud>[] = [
    {
      key: "id",
      header: "ID",
      value: (s) => <span className="mono font-medium">{s.id}</span>,
    },
    {
      key: "proceso",
      header: "Proceso",
      value: (s) => (
        <span className="badge badge-outline">
          {PROCESOS[s.proceso]?.label ?? s.proceso}
        </span>
      ),
    },
    {
      key: "lista",
      header: "Lista de precios",
      value: (s) => <span className="mono">{s.lista?.trim() || "—"}</span>,
    },
    {
      key: "compania",
      header: "Compañía",
      value: (s) => <span>{s.compania}</span>,
    },
    {
      key: "solicitante",
      header: "Solicitante",
      value: (s) => {
        const esPropia = s.solicitanteEmail === currentUser.email;
        return (
          <span>
            {s.solicitanteNombre}
            {esPropia && <span className="badge badge-outline ml-2">Tu solicitud</span>}
          </span>
        );
      },
    },
    {
      key: "fecha",
      header: "Fecha",
      value: (s) => (
        <span className="mono text-zinc-500">
          {formatFechaBD(s.fechaCreacion ?? s.fechaEnvio)}
        </span>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      value: (s) => <EstadoBadge estado={s.estado} />,
    },
    {
      key: "accion",
      header: "Acciones",
      value: (s) => {
        const esPropia = s.solicitanteEmail === currentUser.email;
        const puedeRevisar = !readOnly && !esPropia && s.estado === "PENDIENTE";
        return puedeRevisar ? (
          <button className="btn btn-default" onClick={() => onAbrir(s.id)}>
            <Icon name="search" className="w-3.5 h-3.5" /> Revisar simulación
          </button>
        ) : s.estado === "PENDIENTE" && esPropia ? (
          <button className="btn btn-outline" disabled title="No puede aprobar su propia solicitud">
            <Icon name="ban" className="w-3.5 h-3.5" /> Sin acción
          </button>
        ) : (
          <button className="btn btn-outline" onClick={() => onAbrir(s.id)}>
            {s.estado === "EN_PROCESO" ? "Consultar avance" : "Ver detalle"}
          </button>
        );
      },
    },
  ];

  const columnasSinAcciones = columns.filter((column) => column.key !== "accion");

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-900">
        <p className="font-semibold">Procesamiento no bloqueante</p>
        <p className="text-xs mt-1 text-indigo-800">
          Al autorizar una solicitud, el proceso se ejecuta en segundo plano (estado{" "}
          <b>En proceso</b>) y usted puede seguir trabajando. Consulte el avance en cualquier momento.
        </p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="w-56">
          <Dropdown
            id="filtro-estado"
            label="Estado"
            modelValue={filtroEstado}
            options={estadoOpts}
            searchable={false}
            onChange={(value) => {
              setFiltroEstado(value);
              previousCountRef.current = 0;
              setDisplayedRows([]);
            }}
          />
        </div>
        <div className="w-56">
          <Dropdown
            id="filtro-proceso"
            label="Proceso"
            modelValue={filtroProceso}
            options={procesoOpts}
            searchable={false}
            onChange={(value) => {
              setFiltroProceso(value);
              previousCountRef.current = 0;
              setDisplayedRows([]);
            }}
          />
        </div>
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Buscar solicitudes</span>
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            className="input w-full pl-8"
            placeholder="Buscar por coincidencia..."
            aria-label="Buscar solicitudes por coincidencia"
            value={busqueda}
            onChange={(event) => {
              setBusqueda(event.target.value);
              previousCountRef.current = 0;
              setDisplayedRows([]);
            }}
          />
        </label>
      </div>

      <p className="text-xs text-zinc-500">
        Mostrando {displayedRows.length} de {filtradas.length} solicitud(es)
        {consulta ? ` que coinciden con “${busqueda.trim()}”` : ""}.
        {hasMore ? " Desplácese dentro de la tabla para cargar más." : ""}
      </p>

      <ResponsiveDataTable<Solicitud>
        rows={displayedRows}
        columns={columnasSinAcciones}
        rowKey={(s) => s.id}
        loading={false}
        loadingMore={isLoadingMore}
        hasMore={hasMore}
        nextOffset={nextOffset}
        onLoadMore={handleLoadMore}
        onRowActivate={(s) => onAbrir(s.id)}
        emptyTitle="No hay solicitudes"
        emptyDescription="No hay solicitudes que coincidan con los filtros seleccionados."
      />
      {hasMore && (
        <div className="mt-2 flex justify-center">
          <button
            className="btn btn-outline"
            disabled={isLoadingMore}
            onClick={() => void handleLoadMore({ offset: nextOffset, limit: PAGE_SIZE })}
          >
            {isLoadingMore ? "Cargando..." : "Cargar más solicitudes"}
          </button>
        </div>
      )}
    </div>
  );
}

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
