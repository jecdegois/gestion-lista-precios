/** Motor de cálculo de filas (precio y margen), portado del mockup MV26020. */

import { redondearPrecioComercial } from "./rounding";
import {
  CATALOGO_ARTICULOS,
  NOMBRES_LISTA,
  GRUPOS_ARTICULOS,
  LISTA_BASE_OBJETIVO,
  calcularCostoMinimoArticulo,
  margenMinimoEfectivo,
} from "./catalog";
import type {
  FilaMargen,
  FilaPrecio,
  ModoProceso,
  TipoVariacion,
  ValidacionMargen,
  ValidacionPrecio,
  ArticuloCatalogo,
} from "./domain-types";
import { fmtMonto } from "./format";

export interface CatalogoContext {
  articulos: Record<string, ArticuloCatalogo>;
  nombresLista: Record<string, string>;
  grupos: Record<string, { label: string; articulos: string[] }>;
  listaBase: { codigo: string; nombre: string; nivelPrecio: string };
}

const CATALOGO_POR_DEFECTO: CatalogoContext = {
  articulos: CATALOGO_ARTICULOS,
  nombresLista: NOMBRES_LISTA,
  grupos: GRUPOS_ARTICULOS,
  listaBase: LISTA_BASE_OBJETIVO,
};

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function textoFactorCalculado(factor: number | null | undefined): string {
  return factor != null && !Number.isNaN(factor) ? factor.toFixed(4) : "—";
}

export interface ConversionFactor {
  valido: boolean;
  porcentaje: number | null;
  factor: number | null;
  causa: string | null;
}

/** Porcentaje YA CON SIGNO -> factor multiplicador (1 + p/100), válido en (0, 2]. */
export function convertirPorcentajeAFactor(valor: unknown): ConversionFactor {
  const crudo = String(valor ?? "").trim().replace(",", ".");
  const porcentaje = Number.parseFloat(crudo);
  const formatoValido = crudo !== "" && !Number.isNaN(porcentaje) && /^-?\d+(\.\d+)?$/.test(crudo);
  if (!formatoValido) {
    return { valido: false, porcentaje: null, factor: null, causa: "Formato de variación inválido / valor no numérico." };
  }
  const factor = 1 + porcentaje / 100;
  const valido = factor > 0 && factor <= 2;
  return {
    valido,
    porcentaje,
    factor,
    causa: valido
      ? null
      : "El Descuento % debe generar un multiplicador mayor que 0 y menor o igual a 2 (variación entre -100% y 100%).",
  };
}

export function signoDeTipoVariacion(tv: TipoVariacion | undefined): number {
  return tv === "DISMINUCION" ? -1 : 1;
}

export interface Variacion {
  valido: boolean;
  magnitud: number | null;
  porcentaje: number | null;
  factor: number | null;
  causa: string | null;
}

/** Magnitud SIN signo (>=0) + tipoVariacion -> factor. */
export function calcularVariacion(tipoVariacion: TipoVariacion | undefined, magnitudRaw: unknown): Variacion {
  const crudo = String(magnitudRaw ?? "").trim().replace(",", ".");
  const magnitud = Number.parseFloat(crudo);
  const formatoValido = crudo !== "" && !Number.isNaN(magnitud) && /^\d+(\.\d+)?$/.test(crudo);
  if (!tipoVariacion) {
    return { valido: false, magnitud: null, porcentaje: null, factor: null, causa: "Debe indicar el Tipo de Variación (Aumento o Disminución)." };
  }
  if (!formatoValido) {
    return {
      valido: false,
      magnitud: null,
      porcentaje: null,
      factor: null,
      causa: "El Descuento % debe ser un valor numérico igual o mayor a cero. El signo se define únicamente con Tipo de Variación.",
    };
  }
  const porcentajeConSigno = signoDeTipoVariacion(tipoVariacion) * magnitud;
  const conversion = convertirPorcentajeAFactor(String(porcentajeConSigno));
  return {
    valido: !!tipoVariacion && conversion.valido,
    magnitud,
    porcentaje: porcentajeConSigno,
    factor: conversion.factor,
    causa: conversion.valido ? null : conversion.causa,
  };
}

export interface FilaInput {
  fila?: number;
  codigo: string;
  listaCodigo?: string | null;
  tipoVariacion?: TipoVariacion;
  variacionPorcentaje?: number | string;
  valorPropuestoRaw?: string;
  porcentajeReduccionRaw?: string | number;
  grupoArticulo?: string;
}

export function validarFila(row: FilaInput, modo: ModoProceso, context: CatalogoContext = CATALOGO_POR_DEFECTO): ValidacionPrecio {
  const articulo = context.articulos[row.codigo];
  const margenMinimo = articulo ? margenMinimoEfectivo(articulo) : null;
  const costoMinimo = articulo ? calcularCostoMinimoArticulo(articulo) : null;
  const costo = articulo?.costoReposicion ?? null;
  const base: ValidacionPrecio = {
    valido: false,
    precioActual: null,
    precioPropuesto: null,
    factorPropuesto: null,
    multiplicador: null,
    factorReduccion: null,
    precioRedondeado: null,
    estadoRedondeo: null,
    bandaRedondeo: null,
    margenMinimo,
    costo,
    costoMinimo,
    precioMin: costoMinimo,
    causa: null,
  };

  if (!articulo) {
    return { ...base, causa: "El código de artículo no existe en el catálogo activo." };
  }

  const crudo = String(row.valorPropuestoRaw ?? "").trim().replace(",", ".");
  const numero = Number.parseFloat(crudo);
  const formatoValido = crudo !== "" && !Number.isNaN(numero) && /^-?\d+(\.\d+)?$/.test(crudo);

  if (!formatoValido) {
    return { ...base, precioActual: articulo.precioActual, causa: "Formato de celda inválido / valor no numérico." };
  }

  if (modo === "factor" && (numero <= 0 || numero > 2)) {
    return {
      ...base,
      precioActual: articulo.precioActual,
      precioPropuesto: round2(articulo.precioActual * numero),
      causa: `El factor aplicado (${numero}) está fuera del rango permitido (mayor que 0 y menor o igual a 2).`,
    };
  }

  const precioPropuesto = modo === "factor" ? round2(articulo.precioActual * numero) : round2(numero);
  if (precioPropuesto <= 0) {
    return { ...base, precioActual: articulo.precioActual, precioPropuesto, causa: "El precio propuesto resultante debe ser mayor que cero." };
  }

  const redondeo = redondearPrecioComercial(precioPropuesto);
  const precioParaValidar = redondeo.precioRedondeado ?? precioPropuesto;

  if (costoMinimo != null && precioParaValidar < costoMinimo) {
    return {
      valido: false,
      precioActual: articulo.precioActual,
      precioPropuesto,
      precioRedondeado: redondeo.precioRedondeado,
      estadoRedondeo: redondeo.estado === "CALCULADO" ? "ALERTA_MARGEN" : redondeo.estado,
      bandaRedondeo: redondeo.banda,
      margenMinimo,
      costo,
      costoMinimo,
      causa: `El precio final (${fmtMonto(precioParaValidar)}) es menor que el Costo Mínimo del Artículo (${fmtMonto(costoMinimo)}).`,
    };
  }

  return {
    valido: true,
    precioActual: articulo.precioActual,
    precioPropuesto,
    precioRedondeado: redondeo.precioRedondeado,
    estadoRedondeo: redondeo.estado,
    bandaRedondeo: redondeo.banda,
    margenMinimo,
    costo,
    costoMinimo,
    precioMin: costoMinimo,
    causa: null,
  };
}

export function construirFilaCompleta(row: FilaInput, modo: ModoProceso, context: CatalogoContext = CATALOGO_POR_DEFECTO): FilaPrecio {
  const articulo = context.articulos[row.codigo];
  return {
    fila: row.fila ?? 0,
    codigo: row.codigo,
    descripcion: articulo ? articulo.descripcion : "— Código no encontrado —",
    listaCodigo: row.listaCodigo,
    tipoVariacion: row.tipoVariacion,
    variacionPorcentaje: row.variacionPorcentaje,
    valorPropuestoRaw: row.valorPropuestoRaw,
    multiplicador: modo === "factor" ? Number(row.valorPropuestoRaw) || null : null,
    precioMin: 0,
    factorPropuesto: modo === "factor" ? Number(row.valorPropuestoRaw) || 0 : 0,
    grupoArticulo: row.grupoArticulo,
    validacion: validarFila(row, modo, context),
  };
}

export function construirFilaDesdeVariacion(row: FilaInput, modo: ModoProceso, context: CatalogoContext = CATALOGO_POR_DEFECTO): FilaPrecio {
  if (modo !== "factor") return construirFilaCompleta(row, modo, context);
  const conversion = calcularVariacion(row.tipoVariacion, row.variacionPorcentaje);
  const rowConFactor: FilaInput = { ...row, valorPropuestoRaw: textoFactorCalculado(conversion.factor) };
  const fila = construirFilaCompleta(rowConFactor, modo, context);
  fila.multiplicador = conversion.factor;
  fila.factorPropuesto = conversion.factor ?? 0;
  fila.validacion = { ...fila.validacion, factorPropuesto: conversion.factor, multiplicador: conversion.factor };
  const articulo = context.articulos[row.codigo];
  if (!conversion.valido && articulo) {
    fila.validacion = { ...fila.validacion, valido: false, causa: conversion.causa };
  }
  return fila;
}

export function codigoListaDesdeArchivo(valor: unknown, nombresLista: Record<string, string> = NOMBRES_LISTA): string | undefined {
  const crudo = String(valor ?? "").trim().toLowerCase();
  return Object.keys(nombresLista).find(
    (codigo) => codigo.toLowerCase() === crudo || nombresLista[codigo].toLowerCase() === crudo,
  );
}

export function construirFilaDescuentoMasivo(
  row: FilaInput,
  factorDirecto?: boolean,
  context: CatalogoContext = CATALOGO_POR_DEFECTO,
): FilaPrecio {
  // Si viene de Excel (factorDirecto === true), tratar como factor directo
  // Si viene de manual (factorDirecto === false), tratar como variación porcentual
  const fila = factorDirecto
    ? construirFilaCompleta(row, "factor", context)
    : construirFilaDesdeVariacion(row, "factor", context);
  const listaCodigo = codigoListaDesdeArchivo(row.listaCodigo, context.nombresLista);
  if (!listaCodigo) {
    return {
      ...fila,
      listaCodigo: null,
      lista: "—",
      validacion: { ...fila.validacion, valido: false, causa: "La lista de precio no existe o no tiene un formato válido en la plantilla." },
    };
  }
  return { ...fila, listaCodigo, lista: context.nombresLista[listaCodigo] || listaCodigo };
}

export function construirFilaMargenMasivo(row: FilaInput, context: CatalogoContext = CATALOGO_POR_DEFECTO): FilaMargen {
  const articulo = context.articulos[row.codigo];
  const crudo = String(row.porcentajeReduccionRaw ?? "").trim().replace(",", ".");
  const porcentaje = Number.parseFloat(crudo);
  const formatoValido = crudo !== "" && !Number.isNaN(porcentaje) && /^\d+(\.\d+)?$/.test(crudo);
  const factorReduccion = formatoValido ? porcentaje / 100 : null;
  const multiplicadorMargen = factorReduccion != null ? 1 - factorReduccion : null;
  const margenMinimoBase = articulo ? margenMinimoEfectivo(articulo) : null;
  const costo = articulo && typeof articulo.costoReposicion === "number" ? articulo.costoReposicion : null;
  const costoMinimoBase = costo != null && margenMinimoBase != null && margenMinimoBase >= 0 && margenMinimoBase < 1
    ? costo / (1 - margenMinimoBase)
    : null;

  const validacionBase: ValidacionMargen = {
    valido: false,
    precioActual: articulo ? articulo.precioActual : null,
    multiplicador: multiplicadorMargen,
    factorPropuesto: factorReduccion,
    precioPropuesto: null,
    precioRedondeado: null,
    estadoRedondeo: null,
    bandaRedondeo: null,
    costo,
    costoMinimoBase,
    costoMinimo: null,
    precioMin: null,
    margenPromedio: null,
    margenSobrePrecioRedondeado: null,
    margenMinimoBase,
    margenMinimo: null,
    porcentajeReduccion: formatoValido ? porcentaje : null,
    factorReduccion,
    multiplicadorMargen,
    codigoRechazo: null,
    causa: null,
  };

  const base: FilaMargen = {
    fila: row.fila ?? 0,
    codigo: row.codigo,
    descripcion: articulo ? articulo.descripcion : "—",
    porcentajeReduccion: validacionBase.porcentajeReduccion,
    factorReduccion,
    multiplicadorMargen,
    validacion: validacionBase,
  };

  if (!articulo) {
    return { ...base, validacion: { ...validacionBase, precioActual: null, codigoRechazo: "ARTICULO_NO_EXISTE", causa: "El código de artículo no existe en el catálogo activo." } };
  }
  if (!formatoValido || porcentaje < 0 || porcentaje >= 100) {
    return {
      ...base,
      validacion: {
        ...validacionBase,
        codigoRechazo: "PORCENTAJE_REDUCCION_FUERA_RANGO",
        causa: "El Porcentaje de Reducción debe ser numérico, mayor o igual a 0 y menor que 100 (ej. 10 = 10%).",
      },
    };
  }

  const precioLista = articulo.precioActual;
  const margenPromedio = precioLista > 0 && costo != null ? (precioLista - costo) / precioLista : null;
  const margenMinimo = margenMinimoBase != null && multiplicadorMargen != null
    ? Math.max(0, margenMinimoBase * multiplicadorMargen)
    : null;
  const redondeo = redondearPrecioComercial(precioLista);
  const precioRedondeado = redondeo.precioRedondeado;
  const margenSobrePrecioRedondeado = precioRedondeado != null && precioRedondeado > 0 && costo != null ? 1 - costo / precioRedondeado : null;
  const costoMinimo = costo != null && margenMinimo != null && margenMinimo >= 0 && margenMinimo < 1 ? costo / (1 - margenMinimo) : null;
  const fueraDeRango = redondeo.estado === "FUERA_DE_RANGO";
  const margenNoCumple = !fueraDeRango && margenMinimo != null && margenSobrePrecioRedondeado != null && margenSobrePrecioRedondeado < margenMinimo;

  return {
    ...base,
    validacion: {
      valido: margenMinimo != null && !fueraDeRango && !margenNoCumple,
      precioActual: precioLista,
      precioPropuesto: precioLista,
      precioRedondeado,
      estadoRedondeo: margenNoCumple ? "ALERTA_MARGEN" : redondeo.estado,
      bandaRedondeo: redondeo.banda,
      costo,
      costoMinimoBase,
      costoMinimo,
      margenPromedio,
      margenSobrePrecioRedondeado,
      margenMinimoBase,
      margenMinimo,
      porcentajeReduccion: porcentaje,
      factorReduccion,
      multiplicadorMargen,
      codigoRechazo: fueraDeRango
        ? "PRECIO_FUERA_DE_RANGO"
        : margenNoCumple
          ? "MARGEN_MINIMO_NO_CUMPLE"
          : margenMinimo == null
            ? "DATOS_MARGEN_INVALIDOS"
            : null,
      causa: fueraDeRango
        ? "El precio de lista está fuera del rango comercial de redondeo [0,01 – 100.000,00]."
        : margenNoCumple
          ? "MARGEN_MINIMO_NO_CUMPLE: el margen calculado sobre el precio redondeado es menor que el Margen Mínimo resultante."
          : margenMinimo != null
            ? null
            : "No fue posible calcular el margen (precio o costo inválido).",
    },
  };
}

export function construirFilasMayoreodMasivo(
  codigoGrupo: string,
  tipoVariacion: TipoVariacion,
  magnitud: number | string,
  context: CatalogoContext = CATALOGO_POR_DEFECTO,
): FilaPrecio[] {
  const grupo = context.grupos[codigoGrupo];
  const articulos = grupo ? grupo.articulos : Object.keys(context.articulos);
  return articulos.map((codigo, idx) => {
    const fila = construirFilaDesdeVariacion(
      { fila: idx + 1, codigo, tipoVariacion, variacionPorcentaje: magnitud },
      "factor",
      context,
    );
    return {
      ...fila,
      lista: `${context.listaBase.nombre} / ${context.listaBase.nivelPrecio}`,
      listaCodigo: context.listaBase.codigo,
      grupoArticulo: codigoGrupo,
    };
  });
}

export function construirFilasGestionGlobal(
  listaCodigo: string,
  tipoVariacion: TipoVariacion,
  magnitud: number | string,
  context: CatalogoContext = CATALOGO_POR_DEFECTO,
): FilaPrecio[] {
  const codigos = Object.keys(context.articulos);
  const nombreLista = context.nombresLista[listaCodigo] || listaCodigo || "Lista seleccionada";
  return codigos.map((codigo, idx) => {
    const fila = construirFilaDesdeVariacion(
      { fila: idx + 1, codigo, tipoVariacion, variacionPorcentaje: magnitud },
      "factor",
      context,
    );
    return { ...fila, listaCodigo, lista: nombreLista };
  });
}
