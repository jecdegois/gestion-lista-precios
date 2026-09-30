/**
 * Helpers de previsualización usados por componentes cliente. Reexporta el
 * motor puro (sin dependencias de servidor) para cálculo en vivo en el
 * navegador: variación por factor y redondeo comercial de 12 bandas.
 */

export { calcularVariacion, convertirPorcentajeAFactor } from "./engine";

import { redondearPrecioComercial } from "./rounding";

export interface PreviewRedondeo {
  precioOriginal: number;
  precioRedondeado: number | null;
  estado: import("./rounding").EstadoRedondeo;
  banda: { numero: number; intervalo: string } | null;
}

export function redondeoPreview(precio: number): PreviewRedondeo {
  const r = redondearPrecioComercial(precio);
  return {
    precioOriginal: Math.round(precio * 100) / 100,
    precioRedondeado: r.precioRedondeado,
    estado: r.estado,
    banda: r.banda,
  };
}
