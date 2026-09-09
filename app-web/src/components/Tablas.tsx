"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { EstadoRedondeoBadge } from "./Badges";
import { fmtMonto, fmtPct, fmtFactor } from "@/lib/format";
import { TIPOS_VARIACION } from "@/lib/catalog";
import { esFilaMargen } from "@/lib/domain-types";
import type { FilaMargen, FilaPrecio, FilaResultado } from "@/lib/domain-types";

export function TablaMargenMinimo({ filas }: { filas: FilaMargen[] }) {
  const conError = filas.filter((f) => !f.validacion.valido).length;
  const hallazgos = filas.filter((f) => !f.validacion.valido);
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-2">
        {filas.length} artículo(s) evaluado(s)
        {conError > 0 ? " · " + conError + " con hallazgo" : " · cálculo y redondeo comercial verificados"}
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="text-left font-medium px-3 py-2">Código Artículo</th>
              <th className="text-left font-medium px-3 py-2">Descripción</th>
              <th className="text-right font-medium px-3 py-2">% Reducción</th>
              <th className="text-right font-medium px-3 py-2">Factor norm.</th>
              <th className="text-right font-medium px-3 py-2">Multiplicador</th>
              <th className="text-right font-medium px-3 py-2">Precio Lista</th>
              <th className="text-right font-medium px-3 py-2">Precio Redondeado</th>
              <th className="text-left font-medium px-3 py-2">Banda / Estado</th>
              <th className="text-right font-medium px-3 py-2">Margen Promedio</th>
              <th className="text-right font-medium px-3 py-2">Margen Mínimo</th>
              <th className="text-left font-medium px-3 py-2">Validación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filas.map((f) => {
              const v = f.validacion;
              return (
                <tr key={`${f.fila}-${f.codigo}`} className={!v.valido ? "row-alert" : ""}>
                  <td className="px-3 py-2 mono">{f.codigo}</td>
                  <td className="px-3 py-2">{f.descripcion || "—"}</td>
                  <td className="px-3 py-2 text-right mono">{v.porcentajeReduccion != null ? v.porcentajeReduccion.toFixed(2) + "%" : "—"}</td>
                  <td className="px-3 py-2 text-right mono">{fmtFactor(v.factorReduccion)}</td>
                  <td className="px-3 py-2 text-right mono">{fmtFactor(v.multiplicadorMargen)}</td>
                  <td className="px-3 py-2 text-right mono">{fmtMonto(v.precioActual)}</td>
                  <td className="px-3 py-2 text-right mono">{v.precioRedondeado != null ? <b>{fmtMonto(v.precioRedondeado)}</b> : <span className="text-zinc-400">—</span>}</td>
                  <td className="px-3 py-2"><EstadoRedondeoBadge estado={v.estadoRedondeo} banda={v.bandaRedondeo} /></td>
                  <td className="px-3 py-2 text-right mono">{fmtPct(v.margenPromedio)}</td>
                  <td className="px-3 py-2 text-right mono">{v.margenMinimo != null ? <b>{fmtPct(v.margenMinimo)}</b> : <span className="text-zinc-400">—</span>}</td>
                  <td className="px-3 py-2">
                    {v.valido ? (
                      <span className="badge badge-ok"><Icon name="check" className="w-3 h-3" /> Válida</span>
                    ) : (
                      <span className="badge badge-costo" title={v.causa ?? ""}><Icon name="alertTriangle" className="w-3 h-3" /> Con hallazgo</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hallazgos.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-xs font-semibold text-red-800 mb-1.5">Detalle de hallazgos encontrados en la previsualización:</p>
          <ul className="text-xs text-red-700 space-y-1">
            {hallazgos.map((f) => (
              <li key={`h-${f.fila}`}>
                [{f.codigo}]{f.validacion.codigoRechazo ? " [" + f.validacion.codigoRechazo + "]" : ""}: {f.validacion.causa}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const UMBRAL_PAGINACION = 5000;
const FILAS_POR_PAGINA = 100;

export function TablaPrevisualizacion({ filas }: { filas: FilaPrecio[] }) {
  const [pagina, setPagina] = useState(1);
  const conError = filas.filter((f) => !f.validacion.valido).length;
  const usaPaginacion = filas.length > UMBRAL_PAGINACION;
  const totalPaginas = usaPaginacion ? Math.ceil(filas.length / FILAS_POR_PAGINA) : 1;
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = usaPaginacion ? (paginaSegura - 1) * FILAS_POR_PAGINA : 0;
  const fin = usaPaginacion ? Math.min(inicio + FILAS_POR_PAGINA, filas.length) : filas.length;
  const visibles = usaPaginacion ? filas.slice(inicio, fin) : filas;

  useEffect(() => {
    setPagina(1);
  }, [filas]);

  return (
    <div>
      <p className="text-xs text-zinc-500 mb-2">
        {filas.length} fila(s) evaluada(s){conError > 0 ? " · " + conError + " con hallazgo" : ""}
        {usaPaginacion ? " · Vista paginada" : ""}
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="text-left font-medium px-3 py-2">Código</th>
              <th className="text-left font-medium px-3 py-2">Lista</th>
              <th className="text-left font-medium px-3 py-2">Descripción</th>
              <th className="text-right font-medium px-3 py-2">Precio Actual</th>
              <th className="text-left font-medium px-3 py-2">Tipo Var.</th>
              <th className="text-right font-medium px-3 py-2">Factor</th>
              <th className="text-right font-medium px-3 py-2">Precio Calc.</th>
              <th className="text-right font-medium px-3 py-2">Precio Redondeado</th>
              <th className="text-right font-medium px-3 py-2">Costo Mínimo</th>
              <th className="text-left font-medium px-3 py-2">Estado</th>
              <th className="text-left font-medium px-3 py-2">Validación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visibles.map((f) => {
              const v = f.validacion;
              const tv = f.tipoVariacion ? TIPOS_VARIACION[f.tipoVariacion] : "—";
              return (
                <tr key={`${f.fila}-${f.codigo}-${f.listaCodigo ?? ""}`} className={!v.valido ? "row-alert" : ""}>
                  <td className="px-3 py-2 mono">{f.codigo}</td>
                  <td className="px-3 py-2">{f.lista ?? "—"}</td>
                  <td className="px-3 py-2">{f.descripcion}</td>
                  <td className="px-3 py-2 text-right mono">{fmtMonto(v.precioActual)}</td>
                  <td className="px-3 py-2">
                    <span className={"badge " + (f.tipoVariacion === "DISMINUCION" ? "badge-rechazado" : "badge-ok")}>{tv}</span>
                  </td>
                  <td className="px-3 py-2 text-right mono">{f.valorPropuestoRaw ?? "—"}</td>
                  <td className="px-3 py-2 text-right mono">{fmtMonto(v.precioPropuesto)}</td>
                  <td className="px-3 py-2 text-right mono">{v.precioRedondeado != null ? <b>{fmtMonto(v.precioRedondeado)}</b> : <span className="text-zinc-400">—</span>}</td>
                  <td className="px-3 py-2 text-right mono">{fmtMonto(v.costoMinimo)}</td>
                  <td className="px-3 py-2"><EstadoRedondeoBadge estado={v.estadoRedondeo} banda={v.bandaRedondeo} /></td>
                  <td className="px-3 py-2">
                    {v.valido ? (
                      <span className="badge badge-ok"><Icon name="check" className="w-3 h-3" /> Válida</span>
                    ) : (
                      <span className="badge badge-costo" title={v.causa ?? ""}><Icon name="alertTriangle" className="w-3 h-3" /> Con hallazgo</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {usaPaginacion && (
        <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
          <span>Página {paginaSegura} de {totalPaginas} · {FILAS_POR_PAGINA} registros por página</span>
          <div className="flex gap-2">
            <button className="btn btn-outline" disabled={paginaSegura <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
            <button className="btn btn-outline" disabled={paginaSegura >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
          </div>
        </div>
      )}
      {conError > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-xs font-semibold text-red-800 mb-1.5">Detalle de hallazgos:</p>
          <ul className="text-xs text-red-700 space-y-1">
            {filas.filter((f) => !f.validacion.valido).map((f) => (
              <li key={`he-${f.fila}-${f.codigo}`}>[{f.codigo}]: {f.validacion.causa}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Selector que renderiza la tabla correcta según el tipo de filas. */
export function TablaResultado({ filas }: { filas: FilaResultado[] }) {
  if (filas.length > 0 && filas.every(esFilaMargen)) {
    return <TablaMargenMinimo filas={filas as FilaMargen[]} />;
  }
  return <TablaPrevisualizacion filas={filas as FilaPrecio[]} />;
}
