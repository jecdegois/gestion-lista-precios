import "server-only";
import * as XLSX from "xlsx";
import {
  construirFilaCompleta,
  construirFilaDescuentoMasivo,
  construirFilaMargenMasivo,
  construirFilasGestionGlobal,
  construirFilaDesdeVariacion,
  textoFactorCalculado,
} from "@/lib/engine";
import type { CriteriosArticulo, FilaPrecio, FilaResultado, ProcesoKey, TipoVariacion } from "@/lib/domain-types";
import { fmtMonto } from "@/lib/format";
import { nombreArchivoS3 } from "@/lib/ids";
import { pricingRepository, type HallazgoGestionGlobal } from "../repository/pricing-repository";
import type { CatalogoSolicitud } from "../types";
import {
  cargarContextosPorLista,
  convertirArticuloMaestro,
  crearContextoCatalogo,
  monedaDe,
  nivelesSolicitadosCanonicos,
  resolverNivelPrecio,
} from "./catalog-context";

/** Previsualizaciones (catálogo, Excel y simulaciones): solo leen Softland, NO escriben en la BD. */

const ENCABEZADO_CODIGO = "codigo articulo";
const ENCABEZADO_ARTICULO = "articulo";
const ENCABEZADO_PRECIO = "precio";
const ENCABEZADO_PORCENTAJE = "porcentaje reduccion";
const ENCABEZADO_LEGADO = "factor reduccion";

function normalizarEncabezado(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export async function obtenerCatalogoSolicitud(
  compania: string,
  nivelPrecio?: string,
  incluirArticulos = true,
): Promise<CatalogoSolicitud> {
  const niveles = await pricingRepository.listPriceLevels(compania);
  const nivelSeleccionado = resolverNivelPrecio(niveles, nivelPrecio) ?? null;
  const maestros = incluirArticulos && nivelSeleccionado ? await pricingRepository.listCatalog(compania, nivelSeleccionado) : [];
  const contexto = crearContextoCatalogo(niveles, maestros, undefined, await monedaDe(compania));
  return {
    niveles,
    nivelSeleccionado,
    articulos: Object.values(contexto.articulos),
    grupos: Object.entries(contexto.grupos).map(([codigo, grupo]) => ({ codigo, nombre: grupo.label, cantidad: grupo.articulos.length })),
  };
}

export interface ResultadoParseo {
  ok: boolean;
  error?: string;
  filas: FilaResultado[];
  archivoNombre?: string;
  archivoS3Key?: string;
}

export async function parsearExcel(formData: FormData): Promise<ResultadoParseo> {
  const procesoKey = String(formData.get("proceso") ?? "") as ProcesoKey;
  const compania = String(formData.get("compania") ?? "").trim();
  const nivelPrecio = String(formData.get("nivelPrecio") ?? "").trim();
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Debe adjuntar un archivo .xlsx.", filas: [] };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Formato no soportado. Use un archivo .xlsx.", filas: [] };
  }

  let rows: unknown[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
  } catch {
    return { ok: false, error: "No fue posible leer el archivo Excel.", filas: [] };
  }

  const archivoS3Key = "erp-precios-uploads/" + nombreArchivoS3("carga", "xlsx");

  if (procesoKey === "MARGEN_UTILIDAD_MASIVO") {
    const enc = rows[0] ?? [];
    if (normalizarEncabezado(enc[1]) === ENCABEZADO_LEGADO) {
      return { ok: false, error: "Plantilla obsoleta: 'Factor Reduccion' ya no se admite. Use 'Porcentaje Reduccion' (10 = 10%).", filas: [] };
    }
    if (normalizarEncabezado(enc[0]) !== ENCABEZADO_CODIGO || normalizarEncabezado(enc[1]) !== ENCABEZADO_PORCENTAJE) {
      return { ok: false, error: "Encabezados invalidos: se requieren 'Codigo Articulo' y 'Porcentaje Reduccion'.", filas: [] };
    }
    const niveles = await pricingRepository.listPriceLevels(compania);
    const nivelConsulta = resolverNivelPrecio(niveles, nivelPrecio)
      ?? resolverNivelPrecio(niveles, "MAYOREOD")
      ?? niveles[0]?.codigo;
    const maestros = nivelConsulta ? await pricingRepository.listCatalog(compania, nivelConsulta) : [];
    const contexto = crearContextoCatalogo(niveles, maestros, undefined, await monedaDe(compania));
    const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.length > 0);
    const filas = dataRows.map((r, idx) =>
      construirFilaMargenMasivo({
        fila: idx + 2,
        codigo: r[0] !== undefined ? String(r[0]).trim() : "",
        porcentajeReduccionRaw: r[1] !== undefined ? String(r[1]).trim() : "",
      }, contexto),
    );
    return { ok: true, filas, archivoNombre: file.name, archivoS3Key };
  }

  const esDescuento = procesoKey === "DESCUENTO_LISTA_PRECIO";
  const esPrecioBase = procesoKey === "MAYOREOD_MASIVO";
  if (esPrecioBase) {
    const enc = rows[0] ?? [];
    if (normalizarEncabezado(enc[0]) !== ENCABEZADO_ARTICULO || normalizarEncabezado(enc[1]) !== ENCABEZADO_PRECIO) {
      return { ok: false, error: "Encabezados invalidos: se requieren 'Articulo' y 'Precio'.", filas: [] };
    }
  }
  const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.length > 0);
  const niveles = await pricingRepository.listPriceLevels(compania);
  const nivelesConsultaRaw = esDescuento
    ? dataRows.map((r) => String(r[0] ?? "").trim())
    : esPrecioBase
      ? [nivelPrecio || "MAYOREOD"]
    : [nivelPrecio || niveles[0]?.codigo];
  const nivelesConsulta = nivelesSolicitadosCanonicos(niveles, nivelesConsultaRaw);
  const contextosPorLista = await cargarContextosPorLista(compania, niveles, nivelesConsulta);
  const contextoVacio = crearContextoCatalogo(niveles, []);
  const filas = dataRows.map((r, idx) => {
    if (esDescuento) {
      const listaCodigo = resolverNivelPrecio(niveles, String(r[0] ?? "").trim());
      // Convertir descuento porcentual a multiplicador (10 -> 0.9000).
      const porcentajeRaw = r[2] !== undefined ? String(r[2]).trim() : "";
      const porcentaje = Number.parseFloat(porcentajeRaw.replace(",", "."));
      const formatoValido = porcentajeRaw !== "" && !Number.isNaN(porcentaje) && /^\d+(?:[.,]\d+)?$/.test(porcentajeRaw);
      const factorConvertido = formatoValido ? 1 - (porcentaje / 100) : null;
      const factorTexto = factorConvertido !== null ? textoFactorCalculado(factorConvertido) : porcentajeRaw;
      
      return construirFilaDescuentoMasivo(
        {
          fila: idx + 1,
          listaCodigo: r[0] !== undefined ? String(r[0]).trim() : null,
          codigo: r[1] !== undefined ? String(r[1]).trim() : "",
          tipoVariacion: "DISMINUCION",
          variacionPorcentaje: porcentajeRaw,
          valorPropuestoRaw: factorTexto,
        },
        true, // factorDirecto = true, ahora valorPropuestoRaw contiene el factor convertido
        listaCodigo ? contextosPorLista.get(listaCodigo) ?? contextoVacio : contextoVacio,
      );
    }
    if (esPrecioBase) {
      const precioRaw = r[1] !== undefined ? String(r[1]).trim() : "";
      const listaCodigo = nivelesConsulta[0];
      return construirFilaCompleta(
        {
          fila: idx + 1,
          codigo: r[0] !== undefined ? String(r[0]).trim() : "",
          listaCodigo,
          valorPropuestoRaw: precioRaw,
        },
        "precio",
        listaCodigo ? contextosPorLista.get(listaCodigo) ?? contextoVacio : contextoVacio,
      );
    }
    const listaCodigo = nivelesConsulta[0];
    return construirFilaCompleta(
      {
        fila: idx + 1,
        codigo: r[0] !== undefined ? String(r[0]).trim() : "",
        tipoVariacion: "DISMINUCION",
        valorPropuestoRaw: r[1] !== undefined ? String(r[1]).trim() : "",
      },
      "factor",
      listaCodigo ? contextosPorLista.get(listaCodigo) ?? contextoVacio : contextoVacio,
    );
  });
  return { ok: true, filas, archivoNombre: file.name, archivoS3Key };
}

// ---------------------------------------------------------------------------
// Simulacion manual (previsualizacion; NO toca la BD)
// ---------------------------------------------------------------------------
export interface SimularManualParams {
  proceso: ProcesoKey;
  compania: string;
  nivel?: string;
  nivelBase?: string;
  factor?: string;
  tipoVariacion?: TipoVariacion;
  grupoArticulos?: string;
  criteriosArticulo?: CriteriosArticulo;
  codigosArticulos?: string[];
  items?: { codigo: string; listaCodigo: string; tipoVariacion: TipoVariacion; variacionPorcentaje: string }[];
}

export async function simularManual(input: SimularManualParams): Promise<{ ok: boolean; filas: FilaResultado[] }> {
  const magnitud = input.factor ?? "";
  const tv = input.tipoVariacion ?? (input.proceso === "FACTOR_PRECIO" ? "AUMENTO" : "DISMINUCION");
  const niveles = await pricingRepository.listPriceLevels(input.compania);
  const nivelesSolicitados = input.items
    ? input.items.map((item) => item.listaCodigo)
    : input.proceso === "MAYOREOD_MASIVO"
      ? [input.nivelBase ?? input.nivel ?? niveles[0]?.codigo]
      : [input.nivel ?? input.nivelBase ?? niveles[0]?.codigo];
  const nivelesSolicitadosNoVacios = nivelesSolicitados
    .filter((nivel): nivel is string => Boolean(nivel?.trim()))
    .map((nivel) => nivel.trim().toLowerCase());
  const nivelesConsulta = nivelesSolicitadosCanonicos(niveles, nivelesSolicitados);
  if (nivelesConsulta.length === 0 || nivelesConsulta.length !== new Set(nivelesSolicitadosNoVacios).size) {
    return { ok: false, filas: [] };
  }
  const contextosPorLista = await cargarContextosPorLista(input.compania, niveles, nivelesConsulta);
  const contextoVacio = crearContextoCatalogo(niveles, []);
  const nivelAplicable = resolverNivelPrecio(niveles, input.nivel);
  const nivelBaseAplicable = resolverNivelPrecio(niveles, input.nivelBase ?? input.nivel);

  if (input.proceso === "DESCUENTO_LISTA_PRECIO" && input.items) {
    const filas = input.items.map((it, idx) => {
      const listaCodigo = resolverNivelPrecio(niveles, it.listaCodigo);
      const contexto = listaCodigo ? contextosPorLista.get(listaCodigo) ?? contextoVacio : contextoVacio;
      return construirFilaDescuentoMasivo({
        fila: idx + 1,
        codigo: it.codigo,
        listaCodigo: it.listaCodigo,
        tipoVariacion: it.tipoVariacion,
        variacionPorcentaje: it.variacionPorcentaje,
      }, false, contexto);
    });
    return { ok: true, filas };
  }
  if (nivelAplicable) {
    const contexto = contextosPorLista.get(nivelAplicable) ?? contextoVacio;
    return { ok: true, filas: construirFilasGestionGlobal(nivelAplicable, tv, magnitud, contexto) };
  }
  return { ok: true, filas: [] };
}

export interface SimularGestionGlobalPaginadoInput {
  compania: string;
  nivel: string;
  factor?: string;
  tipoVariacion?: TipoVariacion;
  offset?: number;
  maxRecords?: number;
  soloHallazgos?: boolean;
  /**
   * Lista padre desde la cual se leen los precios (GESTION_LISTAS_PRECIOS.NIVEL_PRECIO_BASE).
   * Si se omite o es igual a `nivel`, los precios se leen de la propia lista.
   */
  nivelPrecioBase?: string;
}

export interface PaginaSimulacionGestionGlobal {
  ok: boolean;
  filas: FilaPrecio[];
  offset: number;
  maxRecords: number;
  hasMore: boolean;
  nextOffset: number | null;
  error?: string;
}

export async function simularGestionGlobalPaginado(input: SimularGestionGlobalPaginadoInput): Promise<PaginaSimulacionGestionGlobal> {
  const niveles = await pricingRepository.listPriceLevels(input.compania);
  const nivel = resolverNivelPrecio(niveles, input.nivel);
  if (!nivel) {
    return { ok: false, filas: [], offset: 0, maxRecords: 200, hasMore: false, nextOffset: null, error: "La lista de precio no existe en los maestros de Softland." };
  }
  const offset = Number.isInteger(input.offset) && (input.offset ?? 0) >= 0 ? input.offset as number : 0;
  const maxRecords = Number.isInteger(input.maxRecords) ? Math.min(Math.max(input.maxRecords as number, 1), 200) : 200;
  if (input.soloHallazgos) {
    // Consulta directa en SQL: una sola query calcula la condición de hallazgo
    // (precio propuesto < precio mínimo) sin loops en Node.js.
    const magnitudRaw = Number.parseFloat(String(input.factor ?? "").replace(",", "."));
    const magnitud = Number.isFinite(magnitudRaw) && magnitudRaw >= 0 ? magnitudRaw : 0;
    const tv = input.tipoVariacion ?? "AUMENTO";
    const pagina = await pricingRepository.listFindings(
      input.compania,
      nivel,
      tv,
      magnitud,
      offset,
      maxRecords,
      input.nivelPrecioBase,
    );
    const nombreLista = nivel;
    const moneda = await monedaDe(input.compania);
    const filas: FilaPrecio[] = pagina.items.map((h: HallazgoGestionGlobal, index: number) => ({
      fila: offset + index + 1,
      codigo: h.codigo,
      descripcion: h.descripcion,
      lista: nombreLista,
      listaCodigo: nivel,
      tipoVariacion: tv,
      variacionPorcentaje: input.factor ?? "",
      multiplicador: h.precioPropuesto > 0 && h.precioActual > 0 ? h.precioPropuesto / h.precioActual : null,
      factorPropuesto: h.precioPropuesto > 0 && h.precioActual > 0 ? h.precioPropuesto / h.precioActual : 0,
      precioMin: h.precioMinimo,
      validacion: {
        valido: false,
        precioActual: h.precioActual,
        precioPropuesto: h.precioPropuesto,
        factorPropuesto: h.precioPropuesto > 0 && h.precioActual > 0 ? h.precioPropuesto / h.precioActual : null,
        multiplicador: h.precioPropuesto > 0 && h.precioActual > 0 ? h.precioPropuesto / h.precioActual : null,
        factorReduccion: null,
        precioRedondeado: h.precioPropuesto,
        estadoRedondeo: "ALERTA_MARGEN" as const,
        bandaRedondeo: null,
        margenMinimo: h.margenUtilidadMin,
        costo: h.costoPromedio,
        costoMinimo: h.precioMinimo,
        precioMin: h.precioMinimo,
        causa: `El precio propuesto (${fmtMonto(h.precioPropuesto, moneda)}) es menor que el precio mínimo del artículo (${fmtMonto(h.precioMinimo, moneda)}).`,
      },
    }));
    return {
      ok: true,
      filas,
      offset,
      maxRecords,
      hasMore: pagina.hasMore,
      nextOffset: pagina.nextOffset,
    };
  }
  const pagina = await pricingRepository.listCatalogPage(input.compania, nivel, "", offset, maxRecords, input.nivelPrecioBase);
  const contexto = crearContextoCatalogo(niveles, pagina.items, nivel, await monedaDe(input.compania));
  const filas = construirFilasGestionGlobal(
    nivel,
    input.tipoVariacion ?? "AUMENTO",
    input.factor ?? "",
    contexto,
  );
  return {
    ok: true,
    filas,
    offset: pagina.offset,
    maxRecords: pagina.maxRecords,
    hasMore: pagina.hasMore,
    nextOffset: pagina.nextOffset,
  };
}

/** Página del catálogo de una lista con búsqueda libre (autocompletado de artículos). */
export async function paginaArticulos(compania: string, nivelPrecio: string, search: string, offset: number, maxRecords: number) {
  const page = await pricingRepository.listCatalogPage(compania, nivelPrecio, search, offset, maxRecords);
  return { ...page, items: page.items.map(convertirArticuloMaestro) };
}
