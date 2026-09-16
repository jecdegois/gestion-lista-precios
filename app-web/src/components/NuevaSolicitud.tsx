"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import Combobox, { type ComboOption } from "./Combobox";
import Dropdown, { type DropdownLoadParams, type SelectOption } from "./newComponents/Dropdown";
import ExcelUploader from "./ExcelUploader";
import { EstadoRedondeoBadge } from "./Badges";
import { TablaResultado } from "./Tablas";
import { fmtMonto } from "@/lib/format";
import {
  PROCESOS,
  calcularCostoMinimoArticulo,
} from "@/lib/catalog";
import { calcularVariacion, redondeoPreview } from "@/lib/preview";
import { simularManual, enviarSolicitud, obtenerCatalogoSolicitud } from "@/app/actions";
import type { ArticuloCatalogo, FilaResultado, Identidad, ProcesoKey, TipoVariacion } from "@/lib/domain-types";
import type { NivelPrecio } from "@/lib/types";

interface ItemManual {
  fila: number;
  codigo: string;
  listaCodigo: string;
  lista: string;
  tipoVariacion: TipoVariacion;
  variacionPorcentaje: string;
}

interface PaginaArticulosResponse {
  items: ArticuloCatalogo[];
  offset: number;
  maxRecords: number;
  hasMore: boolean;
  nextOffset: number | null;
}

const ORDEN_PROCESOS: ProcesoKey[] = [
  "FACTOR_PRECIO",
  "MAYOREOD_MASIVO",
  "DESCUENTO_LISTA_PRECIO",
  "MARGEN_UTILIDAD_MASIVO",
];

export default function NuevaSolicitud({
  readOnly,
  consultaOnly = false,
  currentUser,
  onEnviado,
  onToast,
}: {
  readOnly: boolean;
  consultaOnly?: boolean;
  currentUser: Identidad;
  onEnviado: () => void;
  onToast: (msg: string, variant?: "success" | "error") => void;
}) {
  const compania = currentUser.compania as string;
  const bloquearCaptura = readOnly && !consultaOnly;
  const [tab, setTab] = useState<ProcesoKey>("FACTOR_PRECIO");
  const [modalidad, setModalidad] = useState<"manual" | "excel">("manual");
  const [nivel, setNivel] = useState("");
  const [codigoArticulo, setCodigoArticulo] = useState("");
  const [grupoArticulo, setGrupoArticulo] = useState("");
  const [factor, setFactor] = useState("");
  const [itemsManual, setItemsManual] = useState<ItemManual[]>([]);
  const [errorItem, setErrorItem] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [simulado, setSimulado] = useState(false);
  const [filas, setFilas] = useState<FilaResultado[] | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null);
  const [archivoS3Key, setArchivoS3Key] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [nivelesPrecio, setNivelesPrecio] = useState<NivelPrecio[]>([]);
  const [articulosMaestros, setArticulosMaestros] = useState<ArticuloCatalogo[]>([]);
  const [gruposMaestros, setGruposMaestros] = useState<{ codigo: string; nombre: string; cantidad: number }[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [articulosHasMore, setArticulosHasMore] = useState(false);
  const [articulosNextOffset, setArticulosNextOffset] = useState<number | null>(null);
  const [cargandoArticulos, setCargandoArticulos] = useState(false);
  const [cargandoMasArticulos, setCargandoMasArticulos] = useState(false);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState<ArticuloCatalogo | null>(null);
  const articulosRequestRef = useRef(0);
  const articulosAbortRef = useRef<AbortController | null>(null);

  const proceso = PROCESOS[tab];
  const esDescuento = tab === "DESCUENTO_LISTA_PRECIO";
  const esListaBase = tab === "MAYOREOD_MASIVO";
  const esGestionGlobal = tab === "FACTOR_PRECIO";
  const esMargen = tab === "MARGEN_UTILIDAD_MASIVO";
  const permiteExcel = esDescuento;

  const nivelOpts: SelectOption[] = nivelesPrecio
    .filter((nivel) => esListaBase || nivel.codigo.toUpperCase() !== "MAYOREOD")
    .map((nivel) => ({ value: nivel.codigo, label: nivel.nombre || nivel.codigo }));
  const articuloOpciones = articuloSeleccionado && !articulosMaestros.some((articulo) => articulo.codigo === articuloSeleccionado.codigo)
    ? [articuloSeleccionado, ...articulosMaestros]
    : articulosMaestros;
  const articuloOpts: SelectOption[] = articuloOpciones.map((articulo) => ({
    value: articulo.codigo,
    label: `${articulo.codigo} — ${articulo.descripcion}`,
    searchText: `${articulo.codigo} ${articulo.descripcion}`,
  }));
  const grupoOpts: ComboOption[] = gruposMaestros.map((grupo) => ({
    value: grupo.codigo,
    label: `${grupo.nombre} (${grupo.cantidad} artículos)`,
  }));

  const nombreNivel = (codigo: string) => nivelesPrecio.find((nivel) => nivel.codigo === codigo)?.nombre || codigo;
  const conversion = useMemo(() => calcularVariacion("AUMENTO", factor), [factor]);
  const factorInvalido = factor !== "" && !conversion.valido;
  const listaNoExisteEnMaestros = !!nivel && !nivelesPrecio.some((item) => item.codigo === nivel);

  const articuloSel = articuloSeleccionado ?? (codigoArticulo ? articulosMaestros.find((articulo) => articulo.codigo === codigoArticulo) : undefined);
  const previewArticulo = articuloSel && conversion.valido && conversion.factor != null
    ? redondeoPreview(articuloSel.precioActual * conversion.factor)
    : null;

  // Reset al cambiar de pestaña.
  useEffect(() => {
    setModalidad("manual");
    setNivel("");
    setCodigoArticulo("");
    setArticuloSeleccionado(null);
    setGrupoArticulo("");
    setFactor("");
    setItemsManual([]);
    setErrorItem(null);
    setAck(false);
    setSimulado(false);
    setFilas(null);
    setSent(false);
    setArchivoNombre(null);
    setArchivoS3Key(null);
    setErrorCarga(null);
  }, [tab]);

  const cargarArticulosPaginados = useCallback(async ({ query, offset, maxRecords }: DropdownLoadParams) => {
    if (!esDescuento || modalidad !== "manual" || !nivel) return;
    const requestId = ++articulosRequestRef.current;
    articulosAbortRef.current?.abort();
    const controller = new AbortController();
    articulosAbortRef.current = controller;
    const cargandoMas = offset > 0;
    if (cargandoMas) setCargandoMasArticulos(true);
    else setCargandoArticulos(true);

    try {
      const params = new URLSearchParams({
        compania,
        nivelPrecio: nivel,
        search: query,
        offset: String(offset),
        maxRecords: String(maxRecords),
      });
      const response = await fetch(`/api/catalogo/articulos?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("No fue posible consultar los artículos de la lista de precio.");
      const page = await response.json() as PaginaArticulosResponse;
      if (requestId !== articulosRequestRef.current) return;
      if (!Array.isArray(page.items)) throw new Error("La respuesta de artículos no tiene un formato válido.");

      setArticulosMaestros((prev) => {
        const base = offset === 0 ? page.items : [...prev, ...page.items];
        return Array.from(new Map(base.map((articulo) => [articulo.codigo, articulo])).values());
      });
      setArticulosHasMore(Boolean(page.hasMore));
      setArticulosNextOffset(page.nextOffset);
      setErrorCatalogo(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId === articulosRequestRef.current) {
        setErrorCatalogo(error instanceof Error ? error.message : "No fue posible consultar los artículos de la lista de precio.");
      }
    } finally {
      if (requestId === articulosRequestRef.current) {
        if (cargandoMas) setCargandoMasArticulos(false);
        else setCargandoArticulos(false);
      }
    }
  }, [compania, esDescuento, nivel, modalidad]);

  useEffect(() => {
    let vigente = true;
    const cargarArticulosCompletos = !(esDescuento && modalidad === "manual");
    setCargandoCatalogo(true);
    setErrorCatalogo(null);
    void obtenerCatalogoSolicitud(compania, nivel || undefined, cargarArticulosCompletos)
      .then((catalogo) => {
        if (!vigente) return;
        setNivelesPrecio(catalogo.niveles);
        setArticulosMaestros(cargarArticulosCompletos ? catalogo.articulos : []);
        setGruposMaestros(catalogo.grupos);
      })
      .catch((error) => {
        if (!vigente) return;
        setNivelesPrecio([]);
        setArticulosMaestros([]);
        setGruposMaestros([]);
        setErrorCatalogo((error as Error).message || "No fue posible consultar los maestros de Softland.");
      })
      .finally(() => {
        if (vigente) setCargandoCatalogo(false);
      });
    return () => {
      vigente = false;
    };
  }, [compania, esDescuento, modalidad, nivel]);

  useEffect(() => {
    const esCapturaManual = esDescuento && modalidad === "manual";
    articulosAbortRef.current?.abort();
    articulosRequestRef.current += 1;
    setArticuloSeleccionado(null);
    setCodigoArticulo("");
    setArticulosHasMore(false);
    setArticulosNextOffset(null);
    setCargandoArticulos(false);
    setCargandoMasArticulos(false);
    if (!esCapturaManual || !nivel) {
      setArticulosMaestros([]);
      return;
    }
    setArticulosMaestros([]);
    void cargarArticulosPaginados({ query: "", offset: 0, maxRecords: 50 });
    return () => {
      articulosAbortRef.current?.abort();
      articulosRequestRef.current += 1;
    };
  }, [cargarArticulosPaginados, esDescuento, modalidad, nivel]);

  useEffect(() => {
    if ((esListaBase || esMargen) && !nivel && nivelesPrecio.length > 0) {
      const base = nivelesPrecio.find((item) => item.codigo.toUpperCase() === "MAYOREOD") ?? nivelesPrecio[0];
      setNivel(base.codigo);
    }
  }, [esListaBase, esMargen, nivel, nivelesPrecio]);

  // Cualquier cambio de parámetros invalida la simulación previa (manual).
  useEffect(() => {
    setSimulado(false);
    setSent(false);
  }, [nivel, grupoArticulo, factor, itemsManual]);

  function agregarItem() {
    if (bloquearCaptura) return;
    if (!nivel || !codigoArticulo || factorInvalido || factor === "") return;
    const clave = codigoArticulo + "|" + nivel;
    if (itemsManual.some((it) => it.codigo + "|" + it.listaCodigo === clave)) {
      setErrorItem(`El artículo ${codigoArticulo} ya fue agregado para la lista ${nombreNivel(nivel)}.`);
      return;
    }
    setErrorItem(null);
    setItemsManual((prev) =>
      prev.concat([
        {
          fila: prev.length + 1,
          codigo: codigoArticulo,
          listaCodigo: nivel,
          lista: nombreNivel(nivel),
          tipoVariacion: "AUMENTO",
          variacionPorcentaje: factor,
        },
      ]),
    );
    setCodigoArticulo("");
    setArticuloSeleccionado(null);
    setFactor("");
  }

  function quitarItem(codigo: string, listaCodigo: string) {
    setItemsManual((prev) =>
      prev.filter((it) => !(it.codigo === codigo && it.listaCodigo === listaCodigo)).map((it, i) => ({ ...it, fila: i + 1 })),
    );
  }

  function camposManualCompletos(): boolean {
    if (esListaBase) return !!grupoArticulo && conversion.valido && ack;
    if (esDescuento) return itemsManual.length > 0 && !!nivel && !listaNoExisteEnMaestros;
    return !!nivel && conversion.valido && !listaNoExisteEnMaestros; // Gestión Global
  }

  function camposCompletos(): boolean {
    if (esMargen) return !!filas && filas.every((f) => f.validacion.valido) && !!compania;
    if (modalidad === "excel" && permiteExcel) return !!filas && filas.every((f) => f.validacion.valido) && !!compania;
    return camposManualCompletos();
  }

  function puedeEnviar(): boolean {
    return simulado && camposCompletos() && !readOnly;
  }

  async function handleSimular() {
    if (esMargen || (modalidad === "excel" && permiteExcel)) {
      // Ya hay filas cargadas por el uploader.
      setSimulado(true);
      return;
    }
    const input = {
      proceso: tab,
      compania,
      nivel,
      nivelBase: esListaBase ? nivel : undefined,
      factor,
      tipoVariacion: "AUMENTO" as TipoVariacion,
      grupoArticulos: grupoArticulo,
      items: esDescuento ? itemsManual.map((it) => ({ codigo: it.codigo, listaCodigo: it.listaCodigo, tipoVariacion: it.tipoVariacion, variacionPorcentaje: it.variacionPorcentaje })) : undefined,
    };
    const res = await simularManual(input);
    if (!res.ok) {
      setErrorItem("La compañía, lista o artículo no coincide con los maestros de Softland.");
      setFilas([]);
      setSimulado(false);
      return;
    }
    setErrorItem(null);
    setFilas(res.filas);
    setSimulado(true);
  }

  function handleArchivoParsed(fs: FilaResultado[], nombre: string, s3Key: string) {
    // Marca inválidas filas de descuento con lista base o inexistente en Softland.
    const ajustadas = fs.map((f) => {
      const lc = (f as { listaCodigo?: string | null }).listaCodigo;
      if (esDescuento && lc?.trim().toLowerCase() === "mayoreod") {
        return { ...f, validacion: { ...f.validacion, valido: false, causa: "La Lista Base (MAYOREOD) no se gestiona desde Descuento por Artículo." } };
      }
      if (esDescuento && lc && !nivelesPrecio.some((item) => item.codigo.toLowerCase() === lc.toLowerCase())) {
        return { ...f, validacion: { ...f.validacion, valido: false, causa: "La lista no existe en los maestros de Softland." } };
      }
      return f;
    });
    setFilas(ajustadas);
    setArchivoNombre(nombre);
    setArchivoS3Key(s3Key);
    setSimulado(false);
    setSent(false);
  }

  const conteoErrores = filas ? filas.filter((f) => !f.validacion.valido).length : 0;

  async function handleEnviar() {
    if (!puedeEnviar()) return;
    if (esDescuento && modalidad === "manual" && nivel && !nivelesPrecio.some((item) => item.codigo === nivel)) {
      setErrorItem("La lista seleccionada no existe en los maestros de Softland.");
      return;
    }
    setSending(true);
    const parametros = {
      nivel,
      factor,
      tipoVariacion: "AUMENTO" as TipoVariacion,
      variacionPorcentaje: factor,
      listaBase: esListaBase ? nivel : undefined,
      nivelPrecio: nivel || undefined,
      grupoArticulos: esListaBase ? grupoArticulo : undefined,
      articulos: esDescuento ? filas ?? [] : undefined,
    };
    const res = await enviarSolicitud({
      proceso: tab,
      modalidad: esMargen ? "excel" : modalidad,
      usuarioEmail: currentUser.email,
      usuarioNombre: currentUser.nombre,
      usuarioRol: currentUser.rol,
      compania,
      parametros,
      filas: filas ?? [],
      archivoNombre,
      archivoS3Key,
    });
    setSending(false);
    if (!res.ok) {
      onToast(res.error ?? "No fue posible enviar la solicitud.", "error");
      return;
    }
    setSent(true);
    onToast(`Solicitud ${res.solicitud?.id} enviada a aprobación · Estado: Pendiente de aprobación`, "success");
    onEnviado();
    setTimeout(() => {
      setSimulado(false);
      setFilas(null);
      setItemsManual([]);
      setFactor("");
      setNivel("");
      setGrupoArticulo("");
      setAck(false);
      setSent(false);
      setArchivoNombre(null);
      setArchivoS3Key(null);
    }, 1300);
  }

  return (
    <div className="card p-5">
      {/* Tabs de proceso */}
      <div className="tabs-list mb-4">
        {ORDEN_PROCESOS.map((key) => (
          <span key={key} className={"tab-trigger" + (tab === key ? " active" : "")} onClick={() => setTab(key)}>
            {PROCESOS[key].label}
          </span>
        ))}
      </div>
      <h3 className="text-sm font-semibold mb-1">{proceso.desc}</h3>

      {/* Compañía (contexto fijo) */}
      <div className="max-w-xs mb-4">
        <label className="block text-xs font-medium text-zinc-500 mb-1.5">Compañía</label>
        <div className="input flex items-center gap-2 bg-zinc-50">
          <Icon name="lock" className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-sm font-medium">{compania}</span>
        </div>
        <p className="text-[11px] text-zinc-400 mt-1">Contexto resuelto automáticamente por Softland Security (S2/SS).</p>
        {cargandoCatalogo && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-indigo-600">
            <Icon name="loader" className="w-3.5 h-3.5" spin /> Consultando listas de precio…
          </p>
        )}
        {errorCatalogo && (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
            <b>No fue posible cargar el catálogo:</b> {errorCatalogo}
          </div>
        )}
        {!cargandoCatalogo && !errorCatalogo && nivelesPrecio.length === 0 && (
          <p className="mt-2 text-xs text-amber-700">No hay niveles de precio activos disponibles para esta compañía.</p>
        )}
      </div>

      {/* Sub-tabs manual/excel solo en Descuento */}
      {permiteExcel && (
        <div className="flex gap-2 mb-4">
          <span className={"subtab" + (modalidad === "manual" ? " active" : "")} onClick={() => setModalidad("manual")}>Captura Manual</span>
          <span className={"subtab" + (modalidad === "excel" ? " active" : "")} onClick={() => setModalidad("excel")}>Carga por Plantilla Excel</span>
        </div>
      )}

      {/* FACTOR_PRECIO manual */}
      {esGestionGlobal && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mb-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Lista de Precio</label>
            <Combobox id="nivel-gg" value={nivel} onChange={(o) => setNivel(o.value)} options={nivelOpts} disabled={bloquearCaptura} placeholder="Seleccionar lista..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Factor %</label>
            <input type="number" step="0.01" min="0" value={factor} disabled={bloquearCaptura} onChange={(e) => setFactor(e.target.value)} placeholder="Ej. 10" className="input" />
            {!factorInvalido && factor !== "" && conversion.factor != null && (
              <p className="text-[11px] text-zinc-500 mt-1">Factor aplicado: <b className="mono">{conversion.factor.toFixed(2)}</b></p>
            )}
            {factorInvalido && <p className="text-[11px] text-red-600 mt-1">{conversion.causa}</p>}
          </div>
        </div>
      )}

      {/* DESCUENTO manual */}
      {esDescuento && modalidad === "manual" && (
        <div className="space-y-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Dropdown
              id="nivel-desc"
              modelValue={nivel}
              onChange={(value) => setNivel(value)}
              options={nivelOpts}
              label="Lista de Precio"
              placeholder="Seleccionar lista..."
              searchable={false}
              disabled={bloquearCaptura}
              loading={cargandoCatalogo}
            />
            <Dropdown
              id="codigo-articulo"
              modelValue={codigoArticulo}
              onChange={(value) => {
                setCodigoArticulo(value);
                setArticuloSeleccionado(articuloOpciones.find((articulo) => articulo.codigo === value) ?? null);
              }}
              options={articuloOpts}
              label="Código de Artículo"
              placeholder="Buscar por código o nombre..."
              searchPlaceholder="Buscar por código o nombre..."
              emptyText="No se encontraron artículos por código o nombre."
              searchable
              maxRecords={50}
              hasMore={articulosHasMore}
              nextOffset={articulosNextOffset}
              loading={cargandoArticulos}
              loadingMore={cargandoMasArticulos}
              debounceMs={500}
              onSearch={cargarArticulosPaginados}
              onLoadMore={cargarArticulosPaginados}
              disabled={bloquearCaptura}
            />
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Factor %</label>
              <input type="number" step="0.01" min="0" value={factor} disabled={bloquearCaptura} onChange={(e) => setFactor(e.target.value)} placeholder="Ej. 10" className="input" />
            </div>
          </div>
          {!nivel && !cargandoCatalogo && !errorCatalogo && nivelesPrecio.length > 0 && (
            <p className="text-xs text-zinc-500">Seleccione una lista de precio para consultar los artículos disponibles.</p>
          )}
          {!!nivel && !cargandoCatalogo && !cargandoArticulos && !errorCatalogo && articulosMaestros.length === 0 && (
            <p className="text-xs text-amber-700">La lista seleccionada no tiene artículos con versión activa.</p>
          )}
          {articuloSel && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <Card label="Descripción" value={articuloSel.descripcion} />
              <Card label="Precio Actual" value={fmtMonto(articuloSel.precioActual)} />
              <Card label="Precio Calc. Base" value={previewArticulo ? fmtMonto(previewArticulo.precioOriginal) : "—"} />
              <Card label="Precio Redondeado" value={previewArticulo?.precioRedondeado != null ? fmtMonto(previewArticulo.precioRedondeado) : "—"} />
              <Card label="Costo Mínimo" value={fmtMonto(calcularCostoMinimoArticulo(articuloSel))} />
            </div>
          )}
          {previewArticulo && <EstadoRedondeoBadge estado={previewArticulo.estado} banda={previewArticulo.banda} />}
          <button className="btn btn-outline" disabled={bloquearCaptura || !nivel || !codigoArticulo || factorInvalido || factor === ""} onClick={agregarItem}>
            <Icon name="plus" className="w-3.5 h-3.5" /> Agregar artículo
          </button>
          {errorItem && <p className="text-[11px] text-red-600">{errorItem}</p>}
          {itemsManual.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">#</th>
                    <th className="text-left font-medium px-3 py-2">Código</th>
                    <th className="text-left font-medium px-3 py-2">Lista</th>
                    <th className="text-right font-medium px-3 py-2">Factor %</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {itemsManual.map((it) => (
                    <tr key={it.codigo + it.listaCodigo}>
                      <td className="px-3 py-2">{it.fila}</td>
                      <td className="px-3 py-2 mono">{it.codigo}</td>
                      <td className="px-3 py-2">{it.lista}</td>
                      <td className="px-3 py-2 text-right mono">{it.variacionPorcentaje}</td>
                      <td className="px-3 py-2 text-right">
                        <button className="btn btn-ghost" onClick={() => quitarItem(it.codigo, it.listaCodigo)} disabled={bloquearCaptura}>
                          <Icon name="trash" className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MAYOREOD_MASIVO manual */}
      {esListaBase && (
        <div className="space-y-4 mb-4">
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">⚠️ Atención: esta actualización aplicará cambios sobre la lista {nombreNivel(nivel)} cuando sea autorizada.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Grupo de Artículos</label>
              <Combobox id="grupo-mayoreod" value={grupoArticulo} onChange={(o) => setGrupoArticulo(o.value)} options={grupoOpts} disabled={bloquearCaptura} placeholder="Seleccionar grupo..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Factor %</label>
              <input type="number" step="0.01" min="0" value={factor} disabled={bloquearCaptura} onChange={(e) => setFactor(e.target.value)} placeholder="Ej. 10" className="input" />
              {factorInvalido && <p className="text-[11px] text-red-600 mt-1">{conversion.causa}</p>}
            </div>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 cursor-pointer select-none max-w-xl">
            <input type="checkbox" checked={ack} disabled={bloquearCaptura} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span className="text-sm">Entiendo que esta solicitud aplicará cambios sobre la lista {nombreNivel(nivel)} para el grupo seleccionado cuando un aprobador la autorice.</span>
          </label>
        </div>
      )}

      {/* DESCUENTO excel */}
      {esDescuento && modalidad === "excel" && (
        <div className="space-y-4 mb-4">
          <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-zinc-600">Use las columnas Lista de Precio, Código Artículo y Factor Multiplicador.</p>
            <a href="/api/plantilla?proceso=DESCUENTO_LISTA_PRECIO" className="btn btn-outline"><Icon name="download" className="w-3.5 h-3.5" /> Descargar plantilla</a>
          </div>
          <ExcelUploader disabled={bloquearCaptura} procesoKey={tab} compania={compania} nivelPrecio={nivel} onParsed={handleArchivoParsed} onError={setErrorCarga} />
          {errorCarga && <p className="text-[11px] text-red-600">{errorCarga}</p>}
          {conteoErrores > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">La carga contiene {conteoErrores} fila(s) inválida(s). Corrija y cargue nuevamente.</div>
          )}
        </div>
      )}

      {/* MARGEN_UTILIDAD_MASIVO */}
      {esMargen && (
        <div className="space-y-4 mb-4">
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-900">
            <p className="font-semibold flex items-center gap-1.5"><Icon name="fileSpreadsheet" className="w-4 h-4" /> Carga masiva del porcentaje de reducción de margen (Regla de Mayoreo)</p>
            <p className="text-xs mt-1 text-indigo-800">Cargue por artículo el <b>Porcentaje de Reducción</b> (ej. <b>10 = 10%</b>). El aplicativo normaliza a <b>0.10</b>, aplica el multiplicador <b>0.90</b> y persiste el Margen Mínimo en <span className="mono">ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN</span> al aprobar.</p>
          </div>
          <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
            <a href="/api/plantilla" className="btn btn-outline"><Icon name="download" className="w-3.5 h-3.5" /> Descargar plantilla</a>
          </div>
          <ExcelUploader disabled={bloquearCaptura} procesoKey={tab} compania={compania} nivelPrecio={nivel} onParsed={handleArchivoParsed} onError={setErrorCarga} />
          {errorCarga && <p className="text-[11px] text-red-600">{errorCarga}</p>}
          {conteoErrores > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">La carga contiene {conteoErrores} fila(s) inválida(s). Corrija los porcentajes y cargue nuevamente.</div>
          )}
        </div>
      )}

      {/* Botones */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
        <button className="btn btn-outline" disabled={bloquearCaptura || !camposCompletos()} onClick={handleSimular}>
          <Icon name="search" className="w-3.5 h-3.5" /> {(modalidad === "excel" && permiteExcel) || esMargen ? "Precalcular impacto" : "Simular impacto"}
        </button>
        <button className={"btn " + (esListaBase ? "btn-destructive" : "btn-default")} disabled={!puedeEnviar() || sending} onClick={handleEnviar}>
          {sending ? (<><Icon name="loader" className="w-3.5 h-3.5" spin /> Enviando…</>) : sent ? (<><Icon name="check" className="w-3.5 h-3.5" /> Enviado</>) : esMargen ? "Enviar recálculo a Aprobación" : "Enviar a Aprobación"}
        </button>
      </div>

      {/* Previsualización */}
      {filas && filas.length > 0 && (
        <div className="mt-6 pt-5 border-t border-zinc-100">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="search" className="w-4 h-4 text-zinc-500" />
            <h3 className="text-sm font-semibold">Resultado de la simulación</h3>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-xs text-green-800 mb-3 flex items-center gap-2">
            <Icon name="check" className="w-3.5 h-3.5" /> Simulación completada. Revise los valores resultantes antes de continuar.
          </div>
          <TablaResultado filas={filas} />
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-2.5">
      <p className="text-[10px] text-zinc-400">{label}</p>
      <p className="text-xs font-medium">{value}</p>
    </div>
  );
}
