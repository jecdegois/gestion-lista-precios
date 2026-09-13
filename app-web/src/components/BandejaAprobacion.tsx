"use client";

import { useState } from "react";
import Icon from "./Icon";
import Combobox, { type ComboOption } from "./Combobox";
import { EstadoBadge } from "./Badges";
import { PROCESOS, estaEnAmbito } from "@/lib/catalog";
import type { EstadoSolicitud, Identidad, ProcesoKey, Solicitud } from "@/lib/domain-types";

const ESTADOS: (EstadoSolicitud | "TODOS")[] = [
  "TODOS",
  "PENDIENTE",
  "EN_PROCESO",
  "PROCESADO",
  "PROCESADO_CON_ERRORES",
  "RECHAZADO",
  "ERROR_EJECUCION",
];

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

  const estadoOpts: ComboOption[] = ESTADOS.map((e) => ({ value: e, label: e === "TODOS" ? "Todos los estados" : e }));
  const procesoOpts: ComboOption[] = [
    { value: "TODOS", label: "Todos los procesos" },
    ...Object.keys(PROCESOS).map((k) => ({ value: k, label: PROCESOS[k as ProcesoKey].label })),
  ];

  const visibles = solicitudes.filter((s) => {
    if (!estaEnAmbito(currentUser.compania, s.compania)) return false;
    if (filtroEstado !== "TODOS" && s.estado !== filtroEstado) return false;
    if (filtroProceso !== "TODOS" && s.proceso !== filtroProceso) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-900">
        <p className="font-semibold">Procesamiento no bloqueante</p>
        <p className="text-xs mt-1 text-indigo-800">
          Al autorizar una solicitud, el proceso se ejecuta en segundo plano (estado <b>En proceso</b>) y usted puede seguir trabajando. Consulte el avance en cualquier momento.
        </p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="w-56">
          <label className="block text-xs font-medium text-zinc-500 mb-1.5">Estado</label>
          <Combobox id="filtro-estado" value={filtroEstado} onChange={(o) => setFiltroEstado(o.value)} options={estadoOpts} />
        </div>
        <div className="w-56">
          <label className="block text-xs font-medium text-zinc-500 mb-1.5">Proceso</label>
          <Combobox id="filtro-proceso" value={filtroProceso} onChange={(o) => setFiltroProceso(o.value)} options={procesoOpts} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="text-left font-medium px-4 py-3">ID</th>
              <th className="text-left font-medium px-4 py-3">Proceso</th>
              <th className="text-left font-medium px-4 py-3">Compañía</th>
              <th className="text-left font-medium px-4 py-3">Solicitante</th>
              <th className="text-left font-medium px-4 py-3">Fecha</th>
              <th className="text-left font-medium px-4 py-3">Estado</th>
              <th className="text-left font-medium px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-zinc-400">
                  <Icon name="inbox" className="w-8 h-8 mx-auto mb-2" />
                  No hay solicitudes que coincidan con los filtros.
                </td>
              </tr>
            )}
            {visibles.map((s) => {
              const esPropia = s.solicitanteEmail === currentUser.email;
              const puedeRevisar = !readOnly && !esPropia && s.estado === "PENDIENTE";
              return (
                <tr key={s.id}>
                  <td className="px-4 py-3 mono">{s.id}</td>
                  <td className="px-4 py-3"><span className="badge badge-outline">{PROCESOS[s.proceso].label}</span></td>
                  <td className="px-4 py-3">{s.compania}</td>
                  <td className="px-4 py-3">
                    {s.solicitanteNombre}
                    {esPropia && <span className="badge badge-outline ml-2">Tu solicitud</span>}
                  </td>
                  <td className="px-4 py-3 mono text-zinc-500">{s.fechaEnvio}</td>
                  <td className="px-4 py-3"><EstadoBadge estado={s.estado} /></td>
                  <td className="px-4 py-3">
                    {puedeRevisar ? (
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
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
