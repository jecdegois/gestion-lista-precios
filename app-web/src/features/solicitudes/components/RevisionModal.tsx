"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/shared/components/ui/Icon";
import { EstadoBadge } from "@/features/solicitudes/components/Badges";
import TablaResultadoModal from "@/features/solicitudes/components/tables/TablaResultadoModal";
import TablaImpactoActualizacionMasiva from "@/features/solicitudes/components/tables/TablaImpactoActualizacionMasiva";
import TablaImpactoGestionGlobal from "@/features/solicitudes/components/tables/TablaImpactoGestionGlobal";
import TablaImpactoMargen from "@/features/solicitudes/components/tables/TablaImpactoMargen";
import type { TableLoadParams } from "@/shared/components/ui/ResponsiveDataTable";
import { PROCESOS } from "@/features/solicitudes/utils/catalog";
import { textoResultadoAuditoria } from "@/shared/utils/events";
import { esHallazgoDeNegocio, type FilaMargen, type FilaPrecio, type FilaResultado, type Identidad, type ProcesoKey, type Solicitud } from "@/shared/types/domain-types";
import { getCatalogoGestionGlobal } from "@/features/solicitudes/api/solicitudes-api";
import { fetchGlobalManagementPage } from "@/features/solicitudes/api/paged-api";
import { useSimulationExport } from "@/features/solicitudes/hooks/useSimulationExport";

/** Mismo archivo/columna que la exportación de la simulación de cada proceso. */
const EXPORTACION: Record<ProcesoKey, [slug: string, columna: string, modo?: "precioBase"]> = {
  FACTOR_PRECIO: ["factor_precio", "Variación %"],
  MAYOREOD_MASIVO: ["mayoreod_masivo", "Precio", "precioBase"],
  DESCUENTO_LISTA_PRECIO: ["descuento_lista_precio", "Descuento %"],
  MARGEN_UTILIDAD_MASIVO: ["margen_utilidad_masivo", "Descuento %"],
};

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
  onReintentar,
  onCancelar,
  onDecidirCancelacion,
  onRetomar,
  onEnviarBorrador,
  loadingDetail = false,
}: {
  solicitud: Solicitud;
  currentUser: Identidad;
  readOnly: boolean;
  onClose: () => void;
  onRechazar: (id: string, motivo: string) => void;
  onAprobar: (id: string) => void;
  onReintentar?: (id: string) => void;
  onCancelar?: (id: string, motivo: string) => void;
  onDecidirCancelacion?: (id: string, aprobada: boolean) => void;
  onRetomar?: (id: string) => void;
  onEnviarBorrador?: (id: string) => void;
  /** Mientras sea true, el detalle (filas) está cargando desde el servidor. */
  loadingDetail?: boolean;
}) {
  const [motivo, setMotivo] = useState("");
  const [motivoCancelacion, setMotivoCancelacion] = useState("");

  // Derivado de props — se calcula antes del estado para usarlo en los inicializadores
  const esGestionGlobal = solicitud.proceso === "FACTOR_PRECIO";
  const nivelConsulta = solicitud.lista?.trim() || solicitud.parametros.nivelPrecio?.trim() || solicitud.parametros.listaBase?.trim() || "";
  const factorConsulta = String(solicitud.parametros.factor ?? "");
  const tipoVariacionConsulta = solicitud.parametros.tipoVariacion === "DISMINUCION" ? "DISMINUCION" : "AUMENTO";

  const [filasDetalle, setFilasDetalle] = useState(solicitud.filas);
  const [detalleHasMore, setDetalleHasMore] = useState(false);
  const [detalleNextOffset, setDetalleNextOffset] = useState<number | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [hallazgosDetalle, setHallazgosDetalle] = useState<FilaPrecio[]>([]);
  const [hallazgosDetalleCargados, setHallazgosDetalleCargados] = useState(false);
  const [hallazgosHasMore, setHallazgosHasMore] = useState(false);
  const [hallazgosNextOffset, setHallazgosNextOffset] = useState<number | null>(null);
  const [cargandoHallazgos, setCargandoHallazgos] = useState(false);
  // Gestión Global: totales de la lista completa (la tabla solo trae páginas).
  const [totalArticulos, setTotalArticulos] = useState<number | null>(null);
  const [totalHallazgos, setTotalHallazgos] = useState<number | null>(null);
  const offsetsDetalleEnCarga = useRef(new Set<number>());
  const offsetsHallazgosEnCarga = useRef(new Set<number>());
  // Para Gestión Global: true en cuanto llega la primera página de artículos.
  // Estado one-way (false → true, nunca vuelve) que desacopla la visibilidad
  // de las tablas de los re-renders causados por setCargandoHallazgos u otros.
  const [articulosCargados, setArticulosCargados] = useState(
    !esGestionGlobal || solicitud.filas.length > 0,
  );
  // Lista padre resuelta por el API para Gestión Global (para mostrar el banner en la tabla).
  const [nivelPrecioBaseDetalle, setNivelPrecioBaseDetalle] = useState<string | undefined>(undefined);
  useEffect(() => {
    offsetsDetalleEnCarga.current.clear();
    setHallazgosDetalle([]);
    setHallazgosDetalleCargados(false);
    setHallazgosHasMore(false);
    setHallazgosNextOffset(null);
    setTotalArticulos(null);
    setTotalHallazgos(null);
    offsetsHallazgosEnCarga.current.clear();

    if (esGestionGlobal) {
      // Para GG las filas se cargan desde Softland, no vienen en solicitud.filas.
      // No usamos solicitud.filas como dependencia para evitar que el reset se
      // dispare cuando llega el detalle lazy del modal (que cambiaría solicitud.filas
      // de [] a [...] y volvería a poner articulosCargados en false).
      setFilasDetalle([]);
      setArticulosCargados(false);
      setDetalleHasMore(true);
      setDetalleNextOffset(0);
      setNivelPrecioBaseDetalle(undefined);
    } else {
      setFilasDetalle(solicitud.filas);
      setArticulosCargados(true);
      setDetalleHasMore(false);
      setDetalleNextOffset(null);
    }
  // solicitud.filas se excluye intencionalmente de las dependencias para GG:
  // ver comentario arriba. El ID es suficiente para detectar cambio de solicitud.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitud.id, esGestionGlobal]);


  // Re-lee GESTION_LISTAS_PRECIOS.VALIDAR_PRECIO_BAJO_MARGEN_MIN (listas con el flag activo) cada vez
  // que se abre el modal, para bloquear si el flag se activó después de enviar la solicitud.
  // null = consultando, "error" = falló → no se permite aprobar (falla cerrado) y se ofrece reintentar.
  const [listasMargenMin, setListasMargenMin] = useState<Set<string> | null | "error">(null);
  const [intentoMargen, setIntentoMargen] = useState(0);
  useEffect(() => {
    let cancelado = false;
    setListasMargenMin(null);
    getCatalogoGestionGlobal()
      .then((res) => {
        if (cancelado) return;
        if (!res.ok) { setListasMargenMin("error"); return; }
        setListasMargenMin(new Set((res.data?.listas ?? []).filter((l) => l.validarPrecioBajoMargenMin).map((l) => l.codigo.trim().toUpperCase())));
      })
      .catch(() => { if (!cancelado) setListasMargenMin("error"); });
    return () => { cancelado = true; };
  }, [solicitud.id, intentoMargen]);

  // Para procesos no-GG: sincronizar filas cuando llega el detalle lazy del modal.
  useEffect(() => {
    if (esGestionGlobal) return;
    setFilasDetalle(solicitud.filas);
  }, [solicitud.filas, esGestionGlobal]);
  const cargarDetalle = async ({ offset, limit }: TableLoadParams) => {
    if (!esGestionGlobal || cargandoDetalle || !detalleHasMore) return;
    await fetchPaginaGestionGlobal(offset, limit);
  };
  const fetchPaginaGestionGlobal = async (offset: number, limit: number) => {
    if (!nivelConsulta || offsetsDetalleEnCarga.current.has(offset)) return;
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
        nivelPrecioBase?: string;
        total?: number;
      };
      // One-way: se activa en cuanto la API responde (incluso si viene vacía),
      // garantizando que las tablas permanecen montadas si hallazgos tarda más.
      setArticulosCargados(true);
      if (!response.ok || !Array.isArray(pagina.filas)) return;
      // Capturar la lista padre y el total en la primera página.
      if (offset === 0 && pagina.nivelPrecioBase) setNivelPrecioBaseDetalle(pagina.nivelPrecioBase);
      if (offset === 0 && pagina.total != null) setTotalArticulos(pagina.total);
      const filasPagina = pagina.filas.map((fila, index) => ({ ...fila, fila: offset + index + 1 }));
      setFilasDetalle((actuales) =>
        offset === 0 ? filasPagina : [...actuales, ...filasPagina],
      );
      const siguienteOffset = pagina.nextOffset ?? null;
      const haySiguientePagina =
        Boolean(pagina.hasMore) &&
        filasPagina.length > 0 &&
        siguienteOffset != null &&
        siguienteOffset > offset;
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
    if (!esGestionGlobal || !nivelConsulta) return;
    // Guard con ref para evitar stale-closure con el estado de cargandoHallazgos
    if (offsetsHallazgosEnCarga.current.has(offset)) return;
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
        maxRecords: String(Math.min(limit, 100)),
      });
      const response = await fetch(`/api/simulacion/gestion-global?${query.toString()}`, { cache: "no-store" });
      const pagina = await response.json() as {
        ok?: boolean;
        filas?: FilaPrecio[];
        hasMore?: boolean;
        nextOffset?: number | null;
        total?: number;
      };
      if (!response.ok || !Array.isArray(pagina.filas)) return;
      if (offset === 0) setTotalHallazgos(pagina.total ?? null);
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

  // Carga automática de la primera página al abrir el modal para Gestión Global.
  // Usa fetchPaginaGestionGlobal directamente para evitar la guarda detalleHasMore
  // que podría no estar comprometida aún en el mismo ciclo de render.
  useEffect(() => {
    if (!esGestionGlobal || !nivelConsulta) return;
    void fetchPaginaGestionGlobal(0, 200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitud.id, esGestionGlobal, nivelConsulta, factorConsulta, tipoVariacionConsulta]);

  const filas = filasDetalle;
  const puedeDecidir =
    !readOnly && currentUser.rol === "APROBADOR" && solicitud.estado === "PENDIENTE" && solicitud.solicitanteEmail !== currentUser.email;

  // Bloqueo por VALIDAR_PRECIO_BAJO_MARGEN_MIN (valor VIGENTE): Gestión Global con hallazgos en
  // su lista; Descuento por la lista de cada fila; Precio Base y Margen por MAYOREOD.
  const margenMinActivo = (lista: string | null | undefined) =>
    listasMargenMin instanceof Set && listasMargenMin.has(String(lista ?? "").trim().toUpperCase());
  const listaDeFila = (f: FilaResultado) =>
    solicitud.proceso === "DESCUENTO_LISTA_PRECIO" ? ("listaCodigo" in f && f.listaCodigo) || f.lista : "MAYOREOD";
  const filasConHallazgo = esGestionGlobal ? [] : filas.filter(esHallazgoDeNegocio);
  const listasBloqueadas = esGestionGlobal
    ? (margenMinActivo(nivelConsulta) && (totalHallazgos ?? 0) > 0 ? [nivelConsulta] : [])
    : [...new Set(filasConHallazgo.filter((f) => margenMinActivo(listaDeFila(f))).map(listaDeFila))];
  const bloqueadoPorMargen = listasBloqueadas.length > 0;
  // Mientras se verifica el flag (o si la consulta falla) no se habilita Procesar.
  const verificandoMargen = listasMargenMin === null || (esGestionGlobal && margenMinActivo(nivelConsulta) && totalHallazgos === null);
  const errorMargen = listasMargenMin === "error";
  const cantidadHallazgos = esGestionGlobal ? totalHallazgos ?? hallazgosDetalle.length : filasConHallazgo.length;

  const [slugExportacion, columnaExportacion, modoExportacion] = EXPORTACION[solicitud.proceso];
  const { exporting, exportRows } = useSimulationExport(slugExportacion, columnaExportacion, modoExportacion);
  /** Gestión Global no persiste el detalle: se trae completo, página por página. */
  async function filasParaExportar(): Promise<FilaResultado[]> {
    if (!esGestionGlobal) return filas;
    const todas: FilaPrecio[] = [];
    for (let offset: number | null = 0; offset != null;) {
      const pagina = await fetchGlobalManagementPage({ level: nivelConsulta, factor: factorConsulta, variationType: tipoVariacionConsulta, offset, maxRecords: 200 });
      todas.push(...pagina.filas);
      offset = pagina.hasMore && pagina.filas.length > 0 ? pagina.nextOffset : null;
    }
    return todas;
  }

  const puedeAprobar = puedeDecidir && !bloqueadoPorMargen && !verificandoMargen && !errorMargen && (solicitud.filas.length > 0 || (esGestionGlobal && articulosCargados));
  const enProceso = solicitud.estado === "EN_PROCESO";
  const puedeReintentar =
    !readOnly &&
    onReintentar != null &&
    currentUser.rol === "APROBADOR" &&
    solicitud.estado === "ERROR_EJECUCION" &&
    solicitud.solicitanteEmail !== currentUser.email;
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
          <Card label="Filas evaluadas" value={esGestionGlobal && totalArticulos == null ? "…" : String(esGestionGlobal ? totalArticulos : filas.length)} />
          <Card label="Con hallazgo" value={esGestionGlobal && totalHallazgos == null && cargandoHallazgos ? "…" : String(cantidadHallazgos)} />
          <Card label="Lista de precios" value={listaPrecio} />
          <Card label="Modalidad" value={solicitud.modalidad} />
          <Card label="Ejecución" value={PROCESOS[solicitud.proceso].ejecucion} />
        </div>

        {esActualizacionListaBase && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-800 mb-4">
            Impacto directo sobre la lista maestra {nivelListaBase}.
          </div>
        )}

        {esGestionGlobal && bloqueadoPorMargen && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-800 mb-4">
            <strong>Aprobación bloqueada — {totalHallazgos} artículo(s) con precio bajo margen mínimo</strong>:{" "}
            la lista {nivelConsulta} tiene activada la validación de precio bajo margen mínimo.
          </div>
        )}

        {/* Advertencias de filas con error (descartadas) y de margen; al aprobar solo se procesan
            las válidas y, si el flag de la lista está apagado, las de hallazgo de margen. */}
        {!esGestionGlobal && (() => {
          const filasConError = filas.filter((f) => !f.validacion.valido && !esHallazgoDeNegocio(f)).length;
          const filasConAdvertencia = filasConHallazgo.length;
          if (filasConError === 0 && filasConAdvertencia === 0) return null;
          return (
            <div className="space-y-2 mb-4">
              {filasConError > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-start gap-2">
                  <span className="text-red-500 shrink-0 mt-0.5">✕</span>
                  <span>
                    <strong>{filasConError} fila(s) con error</strong> fueron descartadas de esta solicitud
                    (precio cero, código inválido u otro error de formato) y no serán procesadas.
                  </span>
                </div>
              )}
              {filasConAdvertencia > 0 && (
                bloqueadoPorMargen ? (
                  // Flag ON: la aprobación está bloqueada — el aprobador no puede proceder
                  <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-start gap-2">
                    <span className="text-red-500 shrink-0 mt-0.5">✕</span>
                    <span>
                      <strong>Aprobación bloqueada — {filasConAdvertencia} fila(s) con precio bajo margen mínimo</strong>:{" "}
                      la lista {listasBloqueadas.join(", ")} tiene activada la validación de precio bajo margen mínimo.
                      Esta solicitud <strong>no puede procesarse</strong> mientras contenga precios por debajo del margen mínimo.
                      El solicitante debe corregir los precios y reenviar la solicitud.
                    </span>
                  </div>
                ) : (
                  // Flag OFF: advertencia informativa, el aprobador puede proceder bajo su criterio
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
                    <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
                    <span>
                      <strong>{filasConAdvertencia} fila(s) con advertencia de margen</strong>: el precio propuesto
                      está por debajo del margen mínimo del artículo. Estas filas <strong>sí serán procesadas</strong> si aprueba.
                      Revíselas en la tabla antes de autorizar.
                    </span>
                  </div>
                )
              )}
            </div>
          );
        })()}

        {/* Fase monitoreo */}
        {enProceso && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 mb-4">
            <p className="text-sm text-indigo-900 font-medium">Procesamiento en segundo plano · {solicitud.idProcesoSP}</p>
            <div className="progress-track mt-2"><div className="progress-fill progress-indeterminate" /></div>
            <p className="text-[11px] text-indigo-700 mt-1">Última actualización: {solicitud.ultimaActualizacion ?? "—"}</p>
          </div>
        )}

        {solicitud.estado === "ERROR_EJECUCION" && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 mb-4">
            <p className="text-sm text-amber-900 font-medium">La ejecución terminó con error.</p>
            <p className="text-xs text-amber-800 mt-1">
              No reenvíe la solicitud manualmente mientras el flujo automático de reintentos esté activo.
              Utilice el reintento manual únicamente cuando corresponda según el estado del proceso.
            </p>
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
        {!loadingDetail && (esGestionGlobal ? articulosCargados : filas.length > 0) && (
          <div className="flex justify-end mb-2">
            <button className="btn btn-outline btn-sm" disabled={exporting} onClick={() => void exportRows(filasParaExportar, esGestionGlobal && nivelPrecioBaseDetalle ? `Precios calculados en base a la lista padre: ${nivelPrecioBaseDetalle}` : undefined)}>
              {exporting
                ? <><Icon name="loader" className="w-3.5 h-3.5" spin /> Exportando…</>
                : <><Icon name="download" className="w-3.5 h-3.5" /> Exportar Excel</>}
            </button>
          </div>
        )}
        {loadingDetail ? (
          <div className="flex items-center justify-center py-10 text-sm text-zinc-500">
            <span className="mr-2 animate-spin">⏳</span> Cargando detalle…
          </div>
        ) : (esGestionGlobal ? articulosCargados : filas.length > 0) ? (
          esGestionGlobal ? (
            <TablaImpactoGestionGlobal
              filas={filas as FilaPrecio[]}
              mensajeListaBase={nivelPrecioBaseDetalle ? `Precios calculados en base a la lista padre: ${nivelPrecioBaseDetalle}` : undefined}
              hallazgos={hallazgosDetalle}
              hallazgosHasMore={hallazgosHasMore}
              hallazgosNextOffset={hallazgosNextOffset}
              hallazgosLoadingMore={hallazgosHasMore ? cargandoHallazgos : false}
              hallazgosCargando={cargandoHallazgos}
              onLoadMoreHallazgos={cargarHallazgosDetalle}
              hasMore={detalleHasMore}
              nextOffset={detalleNextOffset}
              loadingMore={cargandoDetalle}
              onLoadMore={cargarDetalle}
            />
          ) : esActualizacionListaBase ? (
            <TablaImpactoActualizacionMasiva
              filas={filas as FilaPrecio[]}
              soloPrecioSolicitado
              mostrarErrores={filas.some((f) => !f.validacion.valido)}
            />
          ) : solicitud.proceso === "MARGEN_UTILIDAD_MASIVO" ? (
            <TablaImpactoMargen
              filas={filas as FilaMargen[]}
              hasMore={detalleHasMore}
              nextOffset={detalleNextOffset}
              loadingMore={cargandoDetalle}
              onLoadMore={cargarDetalle}
            />
          ) : (
            <TablaResultadoModal
              filas={filas}
              modo={solicitud.proceso === "DESCUENTO_LISTA_PRECIO" ? "descuentoArticuloLista" : "general"}
            />
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
            {errorMargen && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-center justify-between gap-2">
                <span>No fue posible verificar la validación de margen mínimo (VALIDAR_PRECIO_BAJO_MARGEN_MIN). No se puede procesar hasta verificarla.</span>
                <button className="btn btn-outline shrink-0" onClick={() => setIntentoMargen((n) => n + 1)}>Reintentar</button>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button className="btn btn-outline" disabled={motivo.trim().length === 0} onClick={() => { onRechazar(solicitud.id, motivo.trim()); onClose(); }}>
                Rechazar
              </button>
              <button className="btn btn-destructive" disabled={!puedeAprobar} onClick={() => { onAprobar(solicitud.id); onClose(); }}>
                <Icon name="check" className="w-3.5 h-3.5" /> {verificandoMargen ? "Verificando margen…" : "Procesar Solicitud"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex justify-end border-t border-zinc-100 pt-4">
            {puedeReintentar && (
              <button className="btn btn-default mr-2" onClick={() => { onReintentar!(solicitud.id); onClose(); }}>
                        <Icon name="loader" className="w-3.5 h-3.5" /> Reintentar ejecución
              </button>
            )}
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
