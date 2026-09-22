"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { EstadoRedondeoBadge } from "./Badges";
import { fmtMonto, fmtPct, fmtFactor, fmtPorcentajeCapturado } from "@/lib/format";
import { TIPOS_VARIACION } from "@/lib/catalog";
import { esFilaMargen } from "@/lib/domain-types";
import TablaHallazgosMargen from "./newComponents/TablaHallazgosMargen";
import type { FilaMargen, FilaPrecio, FilaResultado } from "@/lib/domain-types";
import type { TableLoadParams } from "./newComponents/ResponsiveDataTable";

export function esHallazgoDeNegocio(fila: FilaResultado): boolean {
  const validacion = fila.validacion;
  return !validacion.valido && validacion.estadoRedondeo === "ALERTA_MARGEN" && Boolean(validacion.causa);
}

export function EtiquetaValidacion({ fila }: { fila: FilaResultado }) {
  const validacion = fila.validacion;
  if (validacion.valido) {
    return <span className="badge badge-ok"><Icon name="check" className="w-3 h-3" /> Válida</span>;
  }
  if (esHallazgoDeNegocio(fila)) {
    return <span className="badge badge-costo" title={validacion.causa ?? ""}><Icon name="alertTriangle" className="w-3 h-3" /> Con hallazgo</span>;
  }
  return <span className="badge badge-rechazado" title={validacion.causa ?? ""}><Icon name="alertTriangle" className="w-3 h-3" /> Dato por corregir</span>;
}

export function ResumenValidaciones({
  filas,
  hallazgosExternos,
  hallazgosHasMore = false,
  hallazgosNextOffset = null,
  hallazgosLoadingMore = false,
  onLoadMoreHallazgos,
}: {
  filas: FilaResultado[];
  hallazgosExternos?: FilaResultado[];
  hallazgosHasMore?: boolean;
  hallazgosNextOffset?: number | null;
  hallazgosLoadingMore?: boolean;
  onLoadMoreHallazgos?: (params: TableLoadParams) => void | Promise<void>;
}) {
  const hallazgos = hallazgosExternos ?? filas.filter(esHallazgoDeNegocio);
  const datosPorCorregir = filas.filter((fila) => !fila.validacion.valido && !esHallazgoDeNegocio(fila));

  return (
    <>
      {(hallazgos.length > 0 || hallazgosHasMore) && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-xs font-semibold text-red-800 mb-1.5">Hallazgos de margen:</p>
          <TablaHallazgosMargen
            filas={hallazgos}
            hasMore={hallazgosHasMore}
            nextOffset={hallazgosNextOffset}
            loadingMore={hallazgosLoadingMore}
            onLoadMore={onLoadMoreHallazgos}
          />
        </div>
      )}
      {datosPorCorregir.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-xs font-semibold text-amber-800 mb-1.5">Datos por corregir:</p>
          <ul className="text-xs text-amber-700 space-y-1">
            {datosPorCorregir.map((fila) => (
              <li key={`dato-${fila.fila}-${fila.codigo}`}>[{fila.codigo}]: {fila.validacion.causa ?? "No fue posible validar la fila."}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function TablaMargenMinimo({ filas }: { filas: FilaMargen[] }) {
  const hallazgos = filas.filter(esHallazgoDeNegocio).length;
  const datosPorCorregir = filas.filter((fila) => !fila.validacion.valido && !esHallazgoDeNegocio(fila)).length;
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-2">
        {filas.length} artículo(s) evaluado(s)
        {hallazgos > 0 ? ` · ${hallazgos} con hallazgo` : ""}
        {datosPorCorregir > 0 ? ` · ${datosPorCorregir} dato(s) por corregir` : ""}
        {hallazgos === 0 && datosPorCorregir === 0 ? " · cálculo y redondeo comercial verificados" : ""}
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
              <th className="text-right font-medium px-3 py-2">Precio Mín. Base</th>
              <th className="text-right font-medium px-3 py-2">Precio Mín. Sim.</th>
              <th className="text-left font-medium px-3 py-2">Validación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filas.map((fila) => {
              const validacion = fila.validacion;
              return (
                <tr key={`${fila.fila}-${fila.codigo}`} className={esHallazgoDeNegocio(fila) ? "row-alert" : ""}>
                  <td className="px-3 py-2 mono">{fila.codigo}</td>
                  <td className="px-3 py-2">{fila.descripcion || "—"}</td>
                  <td className="px-3 py-2 text-right mono">{validacion.porcentajeReduccion != null ? `${validacion.porcentajeReduccion.toFixed(2)}%` : "—"}</td>
                  <td className="px-3 py-2 text-right mono">{fmtFactor(validacion.factorReduccion)}</td>
                  <td className="px-3 py-2 text-right mono">{fmtFactor(validacion.multiplicadorMargen)}</td>
                  <td className="px-3 py-2 text-right mono">{fmtMonto(validacion.precioActual)}</td>
                  <td className="px-3 py-2 text-right mono">{validacion.precioRedondeado != null ? <b>{fmtMonto(validacion.precioRedondeado)}</b> : <span className="text-zinc-400">—</span>}</td>
                  <td className="px-3 py-2"><EstadoRedondeoBadge estado={validacion.estadoRedondeo} banda={validacion.bandaRedondeo} /></td>
                  <td className="px-3 py-2 text-right mono">{fmtPct(validacion.margenPromedio)}</td>
                  <td className="px-3 py-2 text-right mono">{fmtMonto(validacion.costoMinimoBase)}</td>
                  <td className="px-3 py-2 text-right mono">{validacion.costoMinimo != null ? <b>{fmtMonto(validacion.costoMinimo)}</b> : <span className="text-zinc-400">—</span>}</td>
                  <td className="px-3 py-2"><EtiquetaValidacion fila={fila} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ResumenValidaciones filas={filas} />
    </div>
  );
}

const UMBRAL_PAGINACION = 5000;
const FILAS_POR_PAGINA = 100;

export function TablaPrevisualizacion({ filas }: { filas: FilaPrecio[] }) {
  const [pagina, setPagina] = useState(1);
  const hallazgos = filas.filter(esHallazgoDeNegocio).length;
  const datosPorCorregir = filas.filter((fila) => !fila.validacion.valido && !esHallazgoDeNegocio(fila)).length;
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
        {filas.length} fila(s) evaluada(s)
        {hallazgos > 0 ? ` · ${hallazgos} con hallazgo` : ""}
        {datosPorCorregir > 0 ? ` · ${datosPorCorregir} dato(s) por corregir` : ""}
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
              <th className="text-right font-medium px-3 py-2">Descuento %</th>
              <th className="text-right font-medium px-3 py-2">Multiplicador</th>
              <th className="text-right font-medium px-3 py-2">Precio Calc.</th>
              <th className="text-right font-medium px-3 py-2">Precio Redondeado</th>
              <th className="text-right font-medium px-3 py-2">Precio Mínimo Equiv.</th>
              <th className="text-left font-medium px-3 py-2">Estado</th>
              <th className="text-left font-medium px-3 py-2">Validación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visibles.map((fila) => {
              const validacion = fila.validacion;
              const tipoVariacion = fila.tipoVariacion ? TIPOS_VARIACION[fila.tipoVariacion] : "—";
              return (
                <tr key={`${fila.fila}-${fila.codigo}-${fila.listaCodigo ?? ""}`} className={esHallazgoDeNegocio(fila) ? "row-alert" : ""}>
                  <td className="px-3 py-2 mono">{fila.codigo}</td>
                  <td className="px-3 py-2">{fila.lista ?? "—"}</td>
                  <td className="px-3 py-2">{fila.descripcion}</td>
                  <td className="px-3 py-2 text-right mono">{fmtMonto(validacion.precioActual)}</td>
                  <td className="px-3 py-2"><span className={`badge ${fila.tipoVariacion === "DISMINUCION" ? "badge-rechazado" : "badge-ok"}`}>{tipoVariacion}</span></td>
                  <td className="px-3 py-2 text-right mono">{fmtPorcentajeCapturado(fila.variacionPorcentaje)}</td>
                  <td className="px-3 py-2 text-right mono">{fmtFactor(fila.multiplicador ?? fila.factorPropuesto)}</td>
                  <td className="px-3 py-2 text-right mono">{fmtMonto(validacion.precioPropuesto)}</td>
                  <td className="px-3 py-2 text-right mono">{validacion.precioRedondeado != null ? <b>{fmtMonto(validacion.precioRedondeado)}</b> : <span className="text-zinc-400">—</span>}</td>
                  <td className="px-3 py-2 text-right mono">{fmtMonto(validacion.costoMinimo)}</td>
                  <td className="px-3 py-2"><EstadoRedondeoBadge estado={validacion.estadoRedondeo} banda={validacion.bandaRedondeo} /></td>
                  <td className="px-3 py-2"><EtiquetaValidacion fila={fila} /></td>
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
            <button className="btn btn-outline" disabled={paginaSegura <= 1} onClick={() => setPagina((valor) => valor - 1)}>Anterior</button>
            <button className="btn btn-outline" disabled={paginaSegura >= totalPaginas} onClick={() => setPagina((valor) => valor + 1)}>Siguiente</button>
          </div>
        </div>
      )}
      <ResumenValidaciones filas={filas} />
    </div>
  );
}

export function TablaResultado({ filas }: { filas: FilaResultado[] }) {
  if (filas.length > 0 && filas.every(esFilaMargen)) {
    return <TablaMargenMinimo filas={filas as FilaMargen[]} />;
  }
  return <TablaPrevisualizacion filas={filas as FilaPrecio[]} />;
}
