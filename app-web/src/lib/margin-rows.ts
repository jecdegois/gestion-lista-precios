import { redondearPrecioComercial } from "./rounding";
import { normalizarPorcentajeReduccion, margenPromedio as calcMargenPromedio } from "./margin";
import type { Articulo, FilaMargenResultado } from "./types";

/**
 * Evalua una fila de la carga masiva de margen contra el catalogo de la
 * compania activa. Aplica normalizacion de porcentaje, redondeo de 12 bandas y
 * validacion de margen sobre el PRECIO REDONDEADO. Es la contraparte
 * (previsualizacion) del SP [COFER].[SP_CALCULAR_MARGEN_MINIMO_ARTICULO].
 */
export function evaluarFilaMargen(
  fila: number,
  codigo: string,
  porcentajeRaw: unknown,
  articulo: Articulo | undefined,
): FilaMargenResultado {
  const norm = normalizarPorcentajeReduccion(porcentajeRaw);

  const base: FilaMargenResultado = {
    fila,
    codigo,
    descripcion: articulo ? articulo.descripcion : "—",
    porcentajeReduccion: norm.porcentaje,
    factorReduccion: norm.factor,
    multiplicadorMargen: norm.multiplicador,
    precioLista: articulo ? articulo.precioLista : null,
    precioRedondeado: null,
    bandaRedondeo: null,
    estadoRedondeo: null,
    margenPromedio: null,
    margenSobrePrecioRedondeado: null,
    margenMinimo: null,
    costoMinimo: null,
    valido: false,
    codigoRechazo: null,
    causa: null,
  };

  if (!articulo) {
    return {
      ...base,
      codigoRechazo: "ARTICULO_NO_EXISTE",
      causa: "El codigo de articulo no existe en el catalogo activo.",
    };
  }

  if (!norm.ok || norm.factor === null || norm.multiplicador === null) {
    return { ...base, codigoRechazo: norm.codigoRechazo, causa: norm.causa };
  }

  const precioLista = articulo.precioLista;
  const costo = articulo.costoPromedio;
  const mp = calcMargenPromedio(precioLista, costo);
  const margenMinimo = mp !== null ? Math.max(0, mp * norm.multiplicador) : null;

  const redondeo = redondearPrecioComercial(precioLista);
  const precioRedondeado = redondeo.precioRedondeado;
  const margenSobreRedondeado =
    precioRedondeado !== null && precioRedondeado > 0 && costo !== null
      ? 1 - costo / precioRedondeado
      : null;
  const costoMinimo =
    costo !== null && margenMinimo !== null && margenMinimo >= 0 && margenMinimo < 1
      ? costo / (1 - margenMinimo)
      : null;

  const fueraDeRango = redondeo.estado === "FUERA_DE_RANGO";
  const margenNoCumple =
    !fueraDeRango &&
    margenMinimo !== null &&
    margenSobreRedondeado !== null &&
    margenSobreRedondeado < margenMinimo;

  return {
    ...base,
    precioRedondeado,
    bandaRedondeo: redondeo.banda,
    estadoRedondeo: margenNoCumple ? "ALERTA_MARGEN" : redondeo.estado,
    margenPromedio: mp,
    margenSobrePrecioRedondeado: margenSobreRedondeado,
    margenMinimo,
    costoMinimo,
    valido: margenMinimo !== null && !fueraDeRango && !margenNoCumple,
    codigoRechazo: fueraDeRango
      ? "PRECIO_FUERA_DE_RANGO"
      : margenNoCumple
        ? "MARGEN_MINIMO_NO_CUMPLE"
        : margenMinimo === null
          ? "DATOS_MARGEN_INVALIDOS"
          : null,
    causa: fueraDeRango
      ? "El precio de lista esta fuera del rango comercial de redondeo [0,01 - 100.000,00]."
      : margenNoCumple
        ? "MARGEN_MINIMO_NO_CUMPLE: el margen calculado sobre el precio redondeado es menor que el Margen Minimo resultante."
        : margenMinimo !== null
          ? null
          : "No fue posible calcular el margen (precio o costo invalido).",
  };
}
