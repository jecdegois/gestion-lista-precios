/**
 * Reglas de negocio del margen minimo (Regla de Mayoreo) - MV26020.
 *
 * Contrato de porcentaje de reduccion:
 *  - El usuario ingresa PORCENTAJE en [0, 100): 10, 20, 10.5.
 *  - La frontera de carga normaliza UNA sola vez: 10 -> 0.10 (factor).
 *  - Multiplicador de margen = 1 - factor (10% -> 0.90).
 *  - Margen Minimo = Margen Promedio * (1 - factor), acotado a >= 0.
 *
 * La UDF real [COFER].[U_FACTOR_REDUCCION_MARGEN] almacena el porcentaje
 * explicito (10.00); el SP y esta capa dividen entre 100.0 al calcular.
 */

export const FACTOR_REDUCCION_DEFAULT = 0.1; // fraccion interna: 10% por defecto

export interface ResultadoNormalizacion {
  ok: boolean;
  porcentaje: number | null;
  factor: number | null;
  multiplicador: number | null;
  codigoRechazo: string | null;
  causa: string | null;
}

/**
 * Valida y normaliza el porcentaje de reduccion capturado por el usuario.
 * Acepta "10", "20", "10.5" y coma decimal ("10,5"). Rechaza vacio, no
 * numerico, negativo o >= 100. No infiere el formato antiguo 0.10 (ambiguo).
 */
export function normalizarPorcentajeReduccion(valor: unknown): ResultadoNormalizacion {
  const crudo = String(valor ?? "").trim().replace(",", ".");
  const porcentaje = Number.parseFloat(crudo);
  const formatoValido = crudo !== "" && !Number.isNaN(porcentaje) && /^\d+(\.\d+)?$/.test(crudo);

  if (!formatoValido || porcentaje < 0 || porcentaje >= 100) {
    return {
      ok: false,
      porcentaje: formatoValido ? porcentaje : null,
      factor: null,
      multiplicador: null,
      codigoRechazo: "PORCENTAJE_REDUCCION_FUERA_RANGO",
      causa: "El Porcentaje de Reduccion debe ser numerico, mayor o igual a 0 y menor que 100 (ej. 10 = 10%).",
    };
  }

  const factor = porcentaje / 100;
  return {
    ok: true,
    porcentaje,
    factor,
    multiplicador: 1 - factor,
    codigoRechazo: null,
    causa: null,
  };
}

/**
 * Convierte el PORCENTAJE almacenado en la UDF a la fraccion de calculo.
 * Replica la logica del SP: U_FACTOR_REDUCCION / 100.0; fallback 0.10 si es null.
 */
export function factorDesdeUdf(porcentajeUdf: number | null | undefined): number {
  return porcentajeUdf !== null && porcentajeUdf !== undefined
    ? porcentajeUdf / 100.0
    : FACTOR_REDUCCION_DEFAULT;
}

/**
 * Margen Minimo = Margen Promedio * (1 - factorNormalizado), acotado a >= 0.
 * `factorReduccion` es la fraccion normalizada en [0, 1). Devuelve null si el
 * precio de lista no es positivo o falta el costo.
 */
export function calcularMargenMinimo(
  precioLista: number | null,
  costoPromedio: number | null,
  factorReduccion: number = FACTOR_REDUCCION_DEFAULT,
): number | null {
  if (precioLista === null || precioLista <= 0 || costoPromedio === null || costoPromedio === undefined) {
    return null;
  }
  if (factorReduccion < 0 || factorReduccion >= 1) {
    throw new Error("factorReduccion debe ser una fraccion normalizada en el rango [0, 1).");
  }
  const margenPromedio = (precioLista - costoPromedio) / precioLista;
  const margenMinimo = margenPromedio * (1 - factorReduccion);
  return Math.max(0, Number(margenMinimo.toFixed(6)));
}

export function margenPromedio(precioLista: number | null, costoPromedio: number | null): number | null {
  if (precioLista === null || precioLista <= 0 || costoPromedio === null || costoPromedio === undefined) {
    return null;
  }
  return (precioLista - costoPromedio) / precioLista;
}
