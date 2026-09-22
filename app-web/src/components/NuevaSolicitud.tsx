"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import Combobox, { type ComboOption } from "./Combobox";
import Dropdown, { type DropdownLoadParams, type SelectOption } from "./newComponents/Dropdown";
import ExcelUploader from "./ExcelUploader";
import { EstadoRedondeoBadge } from "./Badges";
import { TablaResultado } from "./Tablas";
import TablaImpactoDescuentoManual from "./newComponents/TablaImpactoDescuentoManual";
import TablaImpactoActualizacionMasiva from "./newComponents/TablaImpactoActualizacionMasiva";
import TablaImpactoGestionGlobal from "./newComponents/TablaImpactoGestionGlobal";
import TablaImpactoMargen from "./newComponents/TablaImpactoMargen";
import TablaArticulosCapturaManual from "./newComponents/TablaArticulosCapturaManual";
import { type TableLoadParams } from "./newComponents/ResponsiveDataTable";
import { fmtFactor, fmtMonto } from "@/lib/format";
import {
  PROCESOS,
  calcularCostoMinimoArticulo,
} from "@/lib/catalog";
import { calcularVariacion, redondeoPreview } from "@/lib/preview";
import { simularManual, simularGestionGlobalPaginado, enviarSolicitud, guardarBorrador, enviarBorrador, obtenerCatalogoSolicitud, obtenerListasGestionGlobal } from "@/app/actions";
import type { ArticuloCatalogo, CriteriosArticulo, FilaPrecio, FilaResultado, Identidad, ProcesoKey, Solicitud, TipoVariacion } from "@/lib/domain-types";
import { esFilaMargen } from "@/lib/domain-types";
import type { GestionGlobalLista, NivelPrecio } from "@/lib/types";
import { descargarSimulacionExcel } from "@/lib/export-simulation";

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

interface PaginaSimulacionGestionGlobalResponse {
  ok: boolean;
  filas: FilaPrecio[];
  offset: number;
  maxRecords: number;
  hasMore: boolean;
  nextOffset: number | null;
  error?: string;
}

const CLASIFICACION_KEYS = ["clasificacion1", "clasificacion2", "clasificacion3", "clasificacion4", "clasificacion5"] as const;
type ClasificacionKey = (typeof CLASIFICACION_KEYS)[number];
const CLASIFICACION_LABELS: Record<ClasificacionKey, string> = {
  clasificacion1: "Grupo",
  clasificacion2: "Categoria",
  clasificacion3: "Marca",
  clasificacion4: "BDF",
  clasificacion5: "Grupo Compra",
};
const ARTICULO_CLASIFICACION_KEYS: Record<ClasificacionKey, keyof ArticuloCatalogo> = {
  clasificacion1: "grupo",
  clasificacion2: "subcategoria",
  clasificacion3: "marca",
  clasificacion4: "bdf",
  clasificacion5: "marcaGrupoCompra",
};
const ARTICULO_CLASIFICACION_DESCRIPTION_KEYS: Record<ClasificacionKey, keyof ArticuloCatalogo> = {
  clasificacion1: "grupoDescripcion",
  clasificacion2: "subcategoriaDescripcion",
  clasificacion3: "marcaDescripcion",
  clasificacion4: "bdfDescripcion",
  clasificacion5: "marcaGrupoCompraDescripcion",
};

const ORDEN_PROCESOS: ProcesoKey[] = [
  "FACTOR_PRECIO",
  "MAYOREOD_MASIVO",
  "DESCUENTO_LISTA_PRECIO",
  "MARGEN_UTILIDAD_MASIVO",
];

function porcentajeDesdeMultiplicador(multiplicador: unknown, tipo: TipoVariacion): string {
  const valor = Number(multiplicador);
  if (!Number.isFinite(valor)) return "";
  const porcentaje = (tipo === "DISMINUCION" ? 1 - valor : valor - 1) * 100;
  return Number.isFinite(porcentaje) ? String(Number(porcentaje.toFixed(4))) : "";
}

function primerTexto(...valores: unknown[]): string | undefined {
  const valor = valores.find((item) => item != null && String(item).trim() !== "");
  return valor == null ? undefined : String(valor);
}

export default function NuevaSolicitud({
  readOnly,
  consultaOnly = false,
  currentUser,
  borrador,
  onEnviado,
  onTipoSolicitudChange,
  onToast,
}: {
  readOnly: boolean;
  consultaOnly?: boolean;
  currentUser: Identidad;
  borrador?: Solicitud;
  onEnviado: () => void;
  onTipoSolicitudChange?: (proceso: ProcesoKey) => void;
  onToast: (msg: string, variant?: "success" | "error") => void;
}) {
  const compania = currentUser.compania as string;
  const bloquearCaptura = readOnly && !consultaOnly;

  const parametrosBorrador = borrador?.parametros;
  const tipoVariacionInicial: TipoVariacion = borrador?.proceso === "FACTOR_PRECIO"
    ? parametrosBorrador?.tipoVariacion
      ?? (Number(parametrosBorrador?.multiplicador) < 1 ? "DISMINUCION" : "AUMENTO")
    : "DISMINUCION";
  const nivelInicial = primerTexto(
    parametrosBorrador?.nivelPrecio,
    parametrosBorrador?.listaBase,
    parametrosBorrador?.nivel,
    borrador?.lista,
  ) ?? "";
  const factorInicial = primerTexto(parametrosBorrador?.factor, parametrosBorrador?.variacionPorcentaje)
    ?? porcentajeDesdeMultiplicador(parametrosBorrador?.multiplicador, tipoVariacionInicial);

  // Función auxiliar para construir itemsManual desde las filas del borrador
  function itemsDesdeFilasBorrador(filas: FilaResultado[]): ItemManual[] {
    return filas
      .filter((f): f is FilaPrecio => !esFilaMargen(f))
      .map((f, i) => ({
        fila: i + 1,
        codigo: f.codigo,
        listaCodigo: f.listaCodigo ?? "",
        lista: f.lista ?? "",
        tipoVariacion: "DISMINUCION",
        variacionPorcentaje: String(f.variacionPorcentaje ?? ""),
      }));
  }

  const esBorradorDescuentoManual = borrador?.proceso === "DESCUENTO_LISTA_PRECIO" && borrador?.modalidad === "manual";

  const [tab, setTab] = useState<ProcesoKey>(borrador?.proceso ?? "FACTOR_PRECIO");
  const [modalidad, setModalidad] = useState<"manual" | "excel">(borrador?.modalidad ?? "manual");
  const [tipoVariacion, setTipoVariacion] = useState<TipoVariacion>(tipoVariacionInicial);
  const [nivel, setNivel] = useState(nivelInicial);
  const [codigoArticulo, setCodigoArticulo] = useState("");
  const [criteriosArticulo, setCriteriosArticulo] = useState<CriteriosArticulo>(borrador?.parametros?.criteriosArticulo ?? {});
  const [factor, setFactor] = useState(factorInicial);
  const [itemsManual, setItemsManual] = useState<ItemManual[]>(
    esBorradorDescuentoManual && borrador?.filas?.length ? itemsDesdeFilasBorrador(borrador.filas) : []
  );
  const [errorItem, setErrorItem] = useState<string | null>(null);
  // Un borrador de Precio Base sólo pudo guardarse después de aceptar el
  // impacto; al retomarlo debe conservar esa condición para poder enviarlo.
  const [ack, setAck] = useState(borrador?.proceso === "MAYOREOD_MASIVO");
  const [simulado, setSimulado] = useState(!!(borrador?.filas?.length));
  const [filas, setFilas] = useState<FilaResultado[] | null>(borrador?.filas?.length ? borrador.filas : null);
  const [sending, setSending] = useState(false);
  const [exportandoSimulacion, setExportandoSimulacion] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sent, setSent] = useState(false);
  const [archivoNombre, setArchivoNombre] = useState<string | null>(borrador?.archivoNombre ?? null);
  const [archivoS3Key, setArchivoS3Key] = useState<string | null>(borrador?.archivoS3Key ?? null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [nivelesPrecio, setNivelesPrecio] = useState<NivelPrecio[]>([]);
  const [listasGestionGlobal, setListasGestionGlobal] = useState<GestionGlobalLista[]>([]);
  const [articulosMaestros, setArticulosMaestros] = useState<ArticuloCatalogo[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [articulosHasMore, setArticulosHasMore] = useState(false);
  const [articulosNextOffset, setArticulosNextOffset] = useState<number | null>(null);
  const [cargandoArticulos, setCargandoArticulos] = useState(false);
  const [cargandoMasArticulos, setCargandoMasArticulos] = useState(false);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState<ArticuloCatalogo | null>(null);
  const [simulacionGlobalHasMore, setSimulacionGlobalHasMore] = useState(false);
  const [simulacionGlobalNextOffset, setSimulacionGlobalNextOffset] = useState<number | null>(null);
  const [hallazgosGlobal, setHallazgosGlobal] = useState<FilaPrecio[]>([]);
  const [hallazgosGlobalHasMore, setHallazgosGlobalHasMore] = useState(false);
  const [hallazgosGlobalNextOffset, setHallazgosGlobalNextOffset] = useState<number | null>(null);
  const [cargandoHallazgosGlobal, setCargandoHallazgosGlobal] = useState(false);
  const [cargandoSimulacionGlobal, setCargandoSimulacionGlobal] = useState(false);
  const [cargandoMasSimulacionGlobal, setCargandoMasSimulacionGlobal] = useState(false);
  const articulosRequestRef = useRef(0);
  const articulosAbortRef = useRef<AbortController | null>(null);
  const simulacionGlobalRequestRef = useRef(0);
  const simulacionGlobalAbortRef = useRef<AbortController | null>(null);

  // ID del borrador que se está retomando (null = solicitud nueva)
  const [borradorId, setBorradorId] = useState<string | null>(borrador?.id ?? null);
  // Evita que useEffect([tab]) limpie el estado en el montaje inicial
  const montajeInicialRef = useRef(true);

  // Hidrata explícitamente el formulario al retomar un borrador. Esto cubre
  // tanto el montaje normal como el caso en que el borrador llega después de
  // que la pantalla ya estaba montada.
  useEffect(() => {
    if (!borrador) return;
    montajeInicialRef.current = true;
    setTab(borrador.proceso);
    setModalidad(borrador.modalidad);
    setTipoVariacion(tipoVariacionInicial);
    setNivel(nivelInicial);
    setFactor(factorInicial);
    setCriteriosArticulo(borrador.parametros?.criteriosArticulo ?? {});
    setItemsManual(esBorradorDescuentoManual && borrador.filas?.length ? itemsDesdeFilasBorrador(borrador.filas) : []);
    setAck(borrador.proceso === "MAYOREOD_MASIVO");
    setSimulado(Boolean(borrador.filas?.length));
    setFilas(borrador.filas?.length ? borrador.filas : null);
    setArchivoNombre(borrador.archivoNombre ?? null);
    setArchivoS3Key(borrador.archivoS3Key ?? null);
    setBorradorId(borrador.id);
  // El ID identifica una carga de borrador; sus valores se hidratan juntos.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrador?.id]);

  const proceso = PROCESOS[tab];
  const esDescuento = tab === "DESCUENTO_LISTA_PRECIO";
  const esActualizacionMasiva = tab === "MAYOREOD_MASIVO";
  const esListaBase = esActualizacionMasiva;
  const esGestionGlobal = tab === "FACTOR_PRECIO";
  const esMargen = tab === "MARGEN_UTILIDAD_MASIVO";
  const permiteExcel = esDescuento || esListaBase;
  const procesoSolicitud: ProcesoKey = esActualizacionMasiva ? "MAYOREOD_MASIVO" : tab;
  const modalidadSolicitud: "manual" | "excel" = esMargen || esActualizacionMasiva ? "manual" : modalidad;
  const tipoVariacionAplicada: TipoVariacion = esGestionGlobal ? tipoVariacion : "DISMINUCION";

  useEffect(() => {
    onTipoSolicitudChange?.(procesoSolicitud);
  }, [onTipoSolicitudChange, procesoSolicitud]);

  const nivelOpts: SelectOption[] = (esGestionGlobal ? listasGestionGlobal : nivelesPrecio)
    .filter((nivel) => esListaBase ? nivel.codigo.toUpperCase() === "MAYOREOD" : nivel.codigo.toUpperCase() !== "MAYOREOD")
    .map((nivel) => ({ value: nivel.codigo, label: nivel.nombre || nivel.codigo }));
  const gestionGlobalSeleccionada = listasGestionGlobal.find((lista) => lista.codigo === nivel);
  const articuloOpciones = articuloSeleccionado && !articulosMaestros.some((articulo) => articulo.codigo === articuloSeleccionado.codigo)
    ? [articuloSeleccionado, ...articulosMaestros]
    : articulosMaestros;
  const articuloOpts: SelectOption[] = articuloOpciones.map((articulo) => ({
    value: articulo.codigo,
    label: `${articulo.codigo} — ${articulo.descripcion}`,
    searchText: `${articulo.codigo} ${articulo.descripcion}`,
  }));
  function articulosParaClasificacionHasta(indice: number): ArticuloCatalogo[] {
    return articulosMaestros.filter((articulo) =>
      CLASIFICACION_KEYS.slice(0, indice).every((key) => {
        const valor = criteriosArticulo[key];
        return !valor || String(articulo[ARTICULO_CLASIFICACION_KEYS[key]] ?? "") === valor;
      }),
    );
  }

  function opcionesClasificacion(key: ClasificacionKey): SelectOption[] {
    const indice = CLASIFICACION_KEYS.indexOf(key);
    const valores = new Set(
      articulosParaClasificacionHasta(indice)
        .map((articulo) => String(articulo[ARTICULO_CLASIFICACION_KEYS[key]] ?? "").trim())
        .filter(Boolean),
    );
    return Array.from(valores).sort((a, b) => a.localeCompare(b)).map((value) => {
      const articuloConValor = articulosParaClasificacionHasta(indice).find(
        (articulo) => String(articulo[ARTICULO_CLASIFICACION_KEYS[key]] ?? "").trim() === value,
      );
      const descripcion = articuloConValor
        ? String(articuloConValor[ARTICULO_CLASIFICACION_DESCRIPTION_KEYS[key]] ?? "").trim()
        : "";
      return {
        value,
        label: descripcion ? `${value} — ${descripcion}` : value,
        searchText: `${value} ${descripcion}`,
      };
    });
  }

  const opcionesClasificaciones = CLASIFICACION_KEYS.map((key) => ({
    key,
    label: CLASIFICACION_LABELS[key],
    options: opcionesClasificacion(key),
  }));
  const articulosCriterio = articulosMaestros.filter((articulo) =>
    CLASIFICACION_KEYS.every((key) => {
      const valor = criteriosArticulo[key];
      return !valor || String(articulo[ARTICULO_CLASIFICACION_KEYS[key]] ?? "") === valor;
    }),
  );
  const codigosArticulosCriterio = articulosCriterio.map((articulo) => articulo.codigo);

  const nombreNivel = (codigo: string) => nivelesPrecio.find((nivel) => nivel.codigo === codigo)?.nombre || codigo;
  const conversion = useMemo(() => calcularVariacion(tipoVariacionAplicada, factor), [factor, tipoVariacionAplicada]);
  const factorInvalido = factor !== "" && !conversion.valido;
  const listaNoExisteEnMaestros = !!nivel && !nivelesPrecio.some((item) => item.codigo === nivel);

  const articuloSel = articuloSeleccionado ?? (codigoArticulo ? articulosMaestros.find((articulo) => articulo.codigo === codigoArticulo) : undefined);
  const previewArticulo = articuloSel && conversion.valido && conversion.factor != null
    ? redondeoPreview(articuloSel.precioActual * conversion.factor)
    : null;

  // Reset al cambiar de pestaña. No corre en el montaje inicial (preserva estado del borrador).
  useEffect(() => {
    if (montajeInicialRef.current) return;
    setModalidad("manual");
    setNivel("");
    setCodigoArticulo("");
    setArticuloSeleccionado(null);
    setCriteriosArticulo({});
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

  const cargarPaginaGestionGlobal = useCallback(async ({ offset, limit }: TableLoadParams) => {
    if (!esGestionGlobal || !nivel) return;
    const requestId = ++simulacionGlobalRequestRef.current;
    simulacionGlobalAbortRef.current?.abort();
    const controller = new AbortController();
    simulacionGlobalAbortRef.current = controller;
    const cargandoMas = offset > 0;
    if (cargandoMas) setCargandoMasSimulacionGlobal(true);
    else setCargandoSimulacionGlobal(true);

    try {
      const params = new URLSearchParams({
        compania,
        nivel,
        factor,
        tipoVariacion: tipoVariacionAplicada,
        offset: String(offset),
        maxRecords: String(limit),
      });
      const response = await fetch(`/api/simulacion/gestion-global?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("No fue posible calcular la página de impacto de Gestión Global.");
      const page = await response.json() as PaginaSimulacionGestionGlobalResponse;
      if (requestId !== simulacionGlobalRequestRef.current) return;
      if (!page.ok || !Array.isArray(page.filas)) throw new Error(page.error ?? "La respuesta de simulación no tiene un formato válido.");
      const filasPagina = page.filas.map((fila, index) => ({ ...fila, fila: offset + index + 1 }));
      setFilas((prev) => offset === 0 ? filasPagina : [...(prev ?? []), ...filasPagina]);
      setSimulacionGlobalHasMore(Boolean(page.hasMore));
      setSimulacionGlobalNextOffset(page.nextOffset);
      setErrorItem(null);
      setSimulado(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId === simulacionGlobalRequestRef.current) {
        setErrorItem(error instanceof Error ? error.message : "No fue posible calcular la página de impacto de Gestión Global.");
        if (!cargandoMas) {
          setFilas([]);
          setSimulado(false);
        }
      }
    } finally {
      if (requestId === simulacionGlobalRequestRef.current) {
        if (cargandoMas) setCargandoMasSimulacionGlobal(false);
        else setCargandoSimulacionGlobal(false);
      }
    }
  }, [compania, esGestionGlobal, factor, nivel, tipoVariacionAplicada]);

  const cargarHallazgosGlobal = useCallback(async ({ offset, limit }: TableLoadParams) => {
    if (!esGestionGlobal || !nivel || cargandoHallazgosGlobal) return;
    setCargandoHallazgosGlobal(true);
    try {
      const params = new URLSearchParams({
        compania,
        nivel,
        factor,
        tipoVariacion: tipoVariacionAplicada,
        soloHallazgos: "1",
        offset: String(offset),
        maxRecords: String(Math.min(limit, 50)),
      });
      const response = await fetch(`/api/simulacion/gestion-global?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("No fue posible consultar los hallazgos completos.");
      const page = await response.json() as PaginaSimulacionGestionGlobalResponse;
      if (!page.ok || !Array.isArray(page.filas)) throw new Error(page.error ?? "La respuesta de hallazgos no es válida.");
      const filasPagina = page.filas.map((fila, index) => ({ ...fila, fila: offset + index + 1 }));
      setHallazgosGlobal((prev) => offset === 0 ? filasPagina : [...prev, ...filasPagina]);
      setHallazgosGlobalHasMore(Boolean(page.hasMore));
      setHallazgosGlobalNextOffset(page.nextOffset);
    } catch (error) {
      setErrorItem(error instanceof Error ? error.message : "No fue posible consultar los hallazgos completos.");
    } finally {
      setCargandoHallazgosGlobal(false);
    }
  }, [cargandoHallazgosGlobal, compania, esGestionGlobal, factor, nivel, tipoVariacionAplicada]);

  useEffect(() => {
    let vigente = true;
    const cargarArticulosCompletos = !(esDescuento && modalidad === "manual");
    setCargandoCatalogo(true);
    setErrorCatalogo(null);
    const catalogoPromise = obtenerCatalogoSolicitud(compania, nivel || undefined, cargarArticulosCompletos);
    const gestionGlobalPromise = esGestionGlobal ? obtenerListasGestionGlobal(compania) : Promise.resolve<GestionGlobalLista[]>([]);
    void Promise.all([catalogoPromise, gestionGlobalPromise])
      .then(([catalogo, listasGlobales]) => {
        if (!vigente) return;
        setNivelesPrecio(catalogo.niveles);
        setListasGestionGlobal(listasGlobales);
        setArticulosMaestros(cargarArticulosCompletos ? catalogo.articulos : []);
      })
      .catch((error) => {
        if (!vigente) return;
        setNivelesPrecio([]);
        setListasGestionGlobal([]);
        setArticulosMaestros([]);
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
    if (montajeInicialRef.current) return; // preserva criterios del borrador en montaje
    setCriteriosArticulo({});
  }, [nivel]);

  useEffect(() => {
    if ((esListaBase || esMargen) && !nivel && nivelesPrecio.length > 0) {
      const base = nivelesPrecio.find((item) => item.codigo.toUpperCase() === "MAYOREOD") ?? nivelesPrecio[0];
      setNivel(base.codigo);
    }
  }, [esListaBase, esMargen, nivel, nivelesPrecio]);

  // Cualquier cambio de parámetros invalida la simulación previa (manual).
  useEffect(() => {
    if (montajeInicialRef.current) return; // preserva simulación del borrador en montaje
    setSimulado(false);
    setSent(false);
    if (esGestionGlobal) {
      simulacionGlobalAbortRef.current?.abort();
      simulacionGlobalRequestRef.current += 1;
      setFilas(null);
      setSimulacionGlobalHasMore(false);
      setSimulacionGlobalNextOffset(null);
      setHallazgosGlobal([]);
      setHallazgosGlobalHasMore(false);
      setHallazgosGlobalNextOffset(null);
      setCargandoSimulacionGlobal(false);
      setCargandoMasSimulacionGlobal(false);
    }
  }, [criteriosArticulo, esGestionGlobal, factor, itemsManual, nivel, tipoVariacion]);

  // Se desactiva después de que los efectos iniciales hayan conservado los
  // valores del borrador. Los cambios posteriores sí invalidan la simulación.
  useEffect(() => {
    montajeInicialRef.current = false;
  }, []);

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
          tipoVariacion: "DISMINUCION",
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

  function cambiarCriterio(key: ClasificacionKey, value: string) {
    const indice = CLASIFICACION_KEYS.indexOf(key);
    setCriteriosArticulo((actual) => {
      const siguiente: CriteriosArticulo = { ...actual, [key]: value || undefined };
      CLASIFICACION_KEYS.slice(indice + 1).forEach((dependiente) => {
        siguiente[dependiente] = undefined;
      });
      return siguiente;
    });
  }

  function camposManualCompletos(): boolean {
    if (esListaBase) return codigosArticulosCriterio.length > 0 && conversion.valido && ack;
    if (esDescuento) return itemsManual.length > 0 && !!nivel && !listaNoExisteEnMaestros;
    return !!nivel && conversion.valido && !listaNoExisteEnMaestros; // Gestión Global
  }

  function camposCompletos(): boolean {
    if (esMargen) return !!filas && filas.every((f) => f.validacion.valido) && !!compania;
    if (modalidad === "excel" && permiteExcel) return !!filas && filas.every((f) => f.validacion.valido) && !!compania;
    return camposManualCompletos();
  }

  function seleccionarModalidad(siguiente: "manual" | "excel") {
    setModalidad(siguiente);
    setNivel("");
    setCodigoArticulo("");
    setArticuloSeleccionado(null);
    setCriteriosArticulo({});
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
  }

  function puedeEnviar(): boolean {
    return simulado && camposCompletos() && !readOnly && (!esGestionGlobal || (!cargandoSimulacionGlobal && !cargandoMasSimulacionGlobal));
  }

  async function handleSimular() {
    if (esGestionGlobal) {
      await cargarPaginaGestionGlobal({ offset: 0, limit: 200 });
      await cargarHallazgosGlobal({ offset: 0, limit: 50 });
      return;
    }
    if (esMargen || (modalidad === "excel" && permiteExcel)) {
      // Ya hay filas cargadas por el uploader.
      setSimulado(true);
      return;
    }
    const input = {
      proceso: procesoSolicitud,
      compania,
      nivel,
      nivelBase: esListaBase ? nivel : undefined,
      factor,
      tipoVariacion: tipoVariacionAplicada,
      grupoArticulos: esListaBase ? "Criterios seleccionados" : undefined,
      criteriosArticulo: esListaBase ? criteriosArticulo : undefined,
      codigosArticulos: esListaBase ? codigosArticulosCriterio : undefined,
      items: esDescuento && !esActualizacionMasiva ? itemsManual.map((it) => ({ codigo: it.codigo, listaCodigo: it.listaCodigo, tipoVariacion: it.tipoVariacion, variacionPorcentaje: it.variacionPorcentaje })) : undefined,
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
    }) as FilaResultado[];
    setFilas(ajustadas);
    setArchivoNombre(nombre);
    setArchivoS3Key(s3Key);
    setSimulado(false);
    setSent(false);
  }

  async function handleExportarSimulacion() {
    if (!filas || filas.length === 0 || exportandoSimulacion) return;
    setExportandoSimulacion(true);
    try {
      let filasCompletas = filas;
      if (esGestionGlobal && nivel) {
        const todas: FilaPrecio[] = [];
        let offset = 0;
        let hayMas = true;
        while (hayMas) {
          const params = new URLSearchParams({ compania, nivel, factor, tipoVariacion: tipoVariacionAplicada, offset: String(offset), maxRecords: "200" });
          const response = await fetch(`/api/simulacion/gestion-global?${params.toString()}`, { cache: "no-store" });
          if (!response.ok) throw new Error("No fue posible consultar todos los registros de la simulación.");
          const pagina = await response.json() as PaginaSimulacionGestionGlobalResponse;
          if (!pagina.ok || !Array.isArray(pagina.filas)) throw new Error(pagina.error ?? "La respuesta de simulación no es válida.");
          todas.push(...pagina.filas.map((fila, index) => ({ ...fila, fila: offset + index + 1 })));
          hayMas = Boolean(pagina.hasMore) && pagina.filas.length > 0;
          offset = pagina.nextOffset ?? offset + pagina.filas.length;
        }
        filasCompletas = todas;
      }
      descargarSimulacionExcel(
        filasCompletas,
        `simulacion-${tab.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`,
        esGestionGlobal ? "Variación %" : "Descuento %",
      );
    } catch (error) {
      onToast(error instanceof Error ? error.message : "No fue posible exportar la simulación.", "error");
    } finally {
      setExportandoSimulacion(false);
    }
  }

  const conteoErrores = filas ? filas.filter((f) => !f.validacion.valido).length : 0;

  async function handleGuardarBorrador() {
    if (!camposCompletos()) return;
    setSavingDraft(true);
    const parametros = {
      nivel,
      factor,
      multiplicador: conversion.factor,
      tipoVariacion: tipoVariacionAplicada,
      variacionPorcentaje: factor,
      listaBase: esListaBase ? nivel : undefined,
      nivelPrecio: nivel || undefined,
      grupoArticulos: esListaBase ? "Criterios seleccionados" : undefined,
      criteriosArticulo: esListaBase ? criteriosArticulo : undefined,
      codigosArticulos: esListaBase ? codigosArticulosCriterio : undefined,
      articulos: esDescuento && !esActualizacionMasiva ? filas ?? [] : undefined,
    };
    const res = await guardarBorrador({
      proceso: procesoSolicitud,
      modalidad: modalidadSolicitud,
      usuarioEmail: currentUser.email,
      usuarioNombre: currentUser.nombre,
      usuarioRol: currentUser.rol,
      compania,
      parametros,
      filas: filas ?? [],
      archivoNombre,
      archivoS3Key,
    });
    setSavingDraft(false);
    if (!res.ok) {
      onToast(res.error ?? "No fue posible guardar el borrador.", "error");
      return;
    }
    onToast(`Borrador ${res.solicitud?.id} guardado. Puedes retomarlo desde "Mis solicitudes".`, "success");
    onEnviado();
  }

  async function handleEnviar() {
    if (!puedeEnviar()) return;
    if (esDescuento && modalidad === "manual" && nivel && !nivelesPrecio.some((item) => item.codigo === nivel)) {
      setErrorItem("La lista seleccionada no existe en los maestros de Softland.");
      return;
    }
    setSending(true);

    // Si es un borrador que se está retomando, solo cambiar su estado a PENDIENTE
    if (borradorId) {
      const res = await enviarBorrador(borradorId, currentUser.email, currentUser.nombre, currentUser.rol);
      setSending(false);
      if (!res.ok) {
        onToast(res.error ?? "No fue posible enviar el borrador.", "error");
        return;
      }
      setSent(true);
      onToast(`Solicitud ${borradorId} enviada a aprobación · Estado: Pendiente de aprobación`, "success");
      setBorradorId(null);
      onEnviado();
      setTimeout(() => {
        setSimulado(false);
        setFilas(null);
        setItemsManual([]);
        setFactor("");
        setNivel("");
        setCriteriosArticulo({});
        setAck(false);
        setSent(false);
        setArchivoNombre(null);
        setArchivoS3Key(null);
      }, 1300);
      return;
    }

    // Solicitud nueva (flujo original)
    const parametros = {
      nivel,
      factor,
      multiplicador: conversion.factor,
      tipoVariacion: tipoVariacionAplicada,
      variacionPorcentaje: factor,
      listaBase: esListaBase ? nivel : undefined,
      nivelPrecio: nivel || undefined,
      grupoArticulos: esListaBase ? "Criterios seleccionados" : undefined,
      criteriosArticulo: esListaBase ? criteriosArticulo : undefined,
      codigosArticulos: esListaBase ? codigosArticulosCriterio : undefined,
      articulos: esDescuento && !esActualizacionMasiva ? filas ?? [] : undefined,
    };
    const res = await enviarSolicitud({
      proceso: procesoSolicitud,
      modalidad: modalidadSolicitud,
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
      setCriteriosArticulo({});
      setAck(false);
      setSent(false);
      setArchivoNombre(null);
      setArchivoS3Key(null);
    }, 1300);
  }

  return (
    <div className="card p-5">
      {/* Banner de borrador activo */}
      {borradorId && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center gap-3">
          <Icon name="fileEdit" className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">Retomando borrador <span className="mono">{borradorId}</span></p>
            <p className="text-xs text-amber-700">Modifica los datos, vuelve a simular si es necesario y usa "Enviar Solicitud" cuando estés listo.</p>
          </div>
          <button
            className="btn btn-ghost btn-sm text-amber-700"
            onClick={() => { setBorradorId(null); setFilas(null); setSimulado(false); setFactor(""); setNivel(""); }}
            title="Descartar y crear solicitud nueva"
          >
            <Icon name="x" className="w-3.5 h-3.5" /> Descartar
          </button>
        </div>
      )}

      {/* Tabs de proceso */}
      <div className="tabs-list mb-4">
        {ORDEN_PROCESOS.map((key) => (
          <span key={key} className={"tab-trigger" + (tab === key ? " active" : "")} onClick={() => setTab(key)}>
            {PROCESOS[key].label}
          </span>
        ))}
      </div>
      <h3 className="text-sm font-semibold mb-1">{esActualizacionMasiva ? PROCESOS.MAYOREOD_MASIVO.desc : proceso.desc}</h3>

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

      {/* Sub-tabs manual/excel para Descuento y Precio Base */}
      {permiteExcel && (
        <div className="flex gap-2 mb-4">
          <span className={"subtab" + (modalidad === "manual" ? " active" : "")} onClick={() => seleccionarModalidad("manual")}>Captura Manual</span>
          <span className={"subtab" + (modalidad === "excel" ? " active" : "")} onClick={() => seleccionarModalidad("excel")}>Carga por Plantilla Excel</span>
        </div>
      )}

      {/* FACTOR_PRECIO manual */}
      {esGestionGlobal && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 max-w-6xl mb-4">
          <div>
            <Dropdown
              id="nivel-gg"
              modelValue={nivel}
              onChange={(value) => setNivel(value)}
              options={nivelOpts}
              label="Lista de Precio"
              placeholder="Seleccionar lista..."
              searchable={false}
              disabled={bloquearCaptura}
              loading={cargandoCatalogo}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Versión</label>
            <input className="input bg-zinc-50" value={gestionGlobalSeleccionada?.version ?? "—"} readOnly aria-readonly="true" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Variación actual (%)</label>
            <input className="input bg-zinc-50" value={gestionGlobalSeleccionada?.variacionPorc != null ? `${gestionGlobalSeleccionada.variacionPorc}%` : "—"} readOnly aria-readonly="true" />
          </div>
          <Dropdown
            id="tipo-variacion-gg"
            modelValue={tipoVariacion}
            onChange={(value) => setTipoVariacion(value as TipoVariacion)}
            options={[{ value: "AUMENTO", label: "Aumento" }, { value: "DISMINUCION", label: "Descuento" }]}
            label="Tipo de variación"
            searchable={false}
            disabled={bloquearCaptura}
          />
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Variación %</label>
            <input type="number" step="0.01" min="0" value={factor} disabled={bloquearCaptura} onChange={(e) => setFactor(e.target.value)} placeholder="Ej. 10" className="input" />
            {!factorInvalido && factor !== "" && conversion.factor != null && (
              <p className="text-[11px] text-zinc-500 mt-1">Multiplicador: <b className="mono">{fmtFactor(conversion.factor)}</b></p>
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
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Descuento %</label>
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
              <Card label="Precio Red." value={previewArticulo?.precioRedondeado != null ? fmtMonto(previewArticulo.precioRedondeado) : "—"} />
              <Card label="Costo Mínimo" value={fmtMonto(calcularCostoMinimoArticulo(articuloSel))} />
            </div>
          )}
          {previewArticulo && <EstadoRedondeoBadge estado={previewArticulo.estado} banda={previewArticulo.banda} />}
          <button className="btn btn-outline" disabled={bloquearCaptura || !nivel || !codigoArticulo || factorInvalido || factor === ""} onClick={agregarItem}>
            <Icon name="plus" className="w-3.5 h-3.5" /> Agregar artículo
          </button>
          {errorItem && <p className="text-[11px] text-red-600">{errorItem}</p>}
          {itemsManual.length > 0 && (
            <TablaArticulosCapturaManual
              filas={itemsManual}
              disabled={bloquearCaptura}
              onRemove={quitarItem}
            />
          )}
        </div>
      )}

      {/* MAYOREOD_MASIVO manual */}
      {esListaBase && modalidad === "manual" && (
        <div className="space-y-4 mb-4">
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">⚠️ Atención: esta actualización aplicará cambios sobre la lista {nombreNivel(nivel)} cuando sea autorizada.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
            <Dropdown
              id="nivel-mayoreod"
              modelValue={nivel}
              onChange={(value) => setNivel(value)}
              options={nivelOpts}
              label="Lista de Precio"
              placeholder="Seleccionar lista..."
              searchable={false}
              disabled={bloquearCaptura}
              loading={cargandoCatalogo}
            />
            {opcionesClasificaciones.map((criterio) => (
              <Dropdown
                key={criterio.key}
                id={`criterio-${criterio.key}`}
                modelValue={criteriosArticulo[criterio.key] ?? ""}
                onChange={(value) => cambiarCriterio(criterio.key, value)}
                options={criterio.options}
                label={criterio.label}
                placeholder={`Seleccionar ${criterio.label.toLowerCase()}...`}
                searchable
                disabled={bloquearCaptura || !nivel || criterio.options.length === 0}
                loading={cargandoCatalogo}
              />
            ))}
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Descuento %</label>
              <input type="number" step="0.01" min="0" value={factor} disabled={bloquearCaptura} onChange={(e) => setFactor(e.target.value)} placeholder="Ej. 10" className="input" />
              {factorInvalido && <p className="text-[11px] text-red-600 mt-1">{conversion.causa}</p>}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            <b>{codigosArticulosCriterio.length}</b> artículo(s) coinciden con la lista y los criterios seleccionados.
            {codigosArticulosCriterio.length === 0 && <p className="mt-1 text-xs text-amber-700">Seleccione criterios con artículos resultantes antes de simular.</p>}
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 cursor-pointer select-none max-w-xl">
            <input type="checkbox" checked={ack} disabled={bloquearCaptura} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span className="text-sm">Entiendo que esta solicitud aplicará cambios sobre los <b>{codigosArticulosCriterio.length}</b> artículos resultantes de la lista y criterios seleccionados cuando un aprobador la autorice.</span>
          </label>
        </div>
      )}

      {/* DESCUENTO excel */}
      {(esDescuento || esListaBase) && modalidad === "excel" && (
        <div className="space-y-4 mb-4">
          <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-zinc-600">{esListaBase ? "Use las columnas Código Artículo y Descuento %." : "Use las columnas Lista de Precio, Código Artículo y Descuento %."}</p>
            <a href={`/api/plantilla?proceso=${tab}`} className="btn btn-outline"><Icon name="download" className="w-3.5 h-3.5" /> Descargar plantilla</a>
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
        <button className="btn btn-outline" disabled={bloquearCaptura || !camposCompletos() || cargandoSimulacionGlobal || cargandoMasSimulacionGlobal} onClick={handleSimular}>
          <Icon name="search" className="w-3.5 h-3.5" /> {(modalidad === "excel" && permiteExcel) || esMargen ? "Precalcular impacto" : "Simular impacto"}
        </button>
        <button className="btn btn-outline" disabled={!camposCompletos() || !simulado || !filas || filas.length === 0 || savingDraft || sending} onClick={handleGuardarBorrador} title="Simula el impacto primero para poder guardar el borrador">
          {savingDraft ? (<><Icon name="loader" className="w-3.5 h-3.5" spin /> Guardando…</>) : <><Icon name="save" className="w-3.5 h-3.5" /> Guardar borrador</>}
        </button>
        <button className={"btn " + (esListaBase ? "btn-destructive" : "btn-default")} disabled={!puedeEnviar() || sending} onClick={handleEnviar}>
          {sending ? (<><Icon name="loader" className="w-3.5 h-3.5" spin /> Enviando…</>) : sent ? (<><Icon name="check" className="w-3.5 h-3.5" /> Enviado</>) : "Enviar Solicitud"}
        </button>
      </div>

      {/* Previsualización */}
      {filas && filas.length > 0 && (
        <div className="mt-6 pt-5 border-t border-zinc-100">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="search" className="w-4 h-4 text-zinc-500" />
            <h3 className="text-sm font-semibold mr-auto">Resultado de la simulación</h3>
            <button className="btn btn-outline btn-sm" disabled={exportandoSimulacion || cargandoSimulacionGlobal || cargandoMasSimulacionGlobal} onClick={() => void handleExportarSimulacion()}>
              <Icon name="download" className="w-3.5 h-3.5" /> {exportandoSimulacion ? "Exportando…" : "Exportar Excel"}
            </button>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-xs text-green-800 mb-3 flex items-center gap-2">
            <Icon name="check" className="w-3.5 h-3.5" /> Simulación completada. Revise los valores resultantes antes de continuar.
          </div>
          {esGestionGlobal ? (
            <>
              {simulacionGlobalHasMore && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5 text-xs text-blue-800 mb-3">
                  Se muestra una página del impacto. El resto de los artículos se consulta bajo demanda; no es necesario cargar toda la lista para enviar la solicitud.
                </div>
              )}
              <TablaImpactoGestionGlobal
                filas={filas as FilaPrecio[]}
                hallazgos={hallazgosGlobal}
                hallazgosHasMore={hallazgosGlobalHasMore}
                hallazgosNextOffset={hallazgosGlobalNextOffset}
                hallazgosLoadingMore={cargandoHallazgosGlobal}
                onLoadMoreHallazgos={cargarHallazgosGlobal}
                hasMore={simulacionGlobalHasMore}
                nextOffset={simulacionGlobalNextOffset}
                loadingMore={cargandoMasSimulacionGlobal}
                onLoadMore={cargarPaginaGestionGlobal}
              />
            </>
          ) : esListaBase ? (
            <TablaImpactoActualizacionMasiva filas={filas as FilaPrecio[]} />
          ) : esDescuento ? (
            <TablaImpactoDescuentoManual filas={filas as FilaPrecio[]} />
          ) : esMargen ? (
            <TablaImpactoMargen filas={filas as any[]} />
          ) : (
            <TablaResultado filas={filas} />
          )}
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
