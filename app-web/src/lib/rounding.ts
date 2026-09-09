/**
 * Motor de redondeo comercial (12 bandas contiguas: 0,01 - 100.000,00).
 * Replica exacta del algoritmo validado (27/27 casos del informe de redondeo)
 * usado por el mockup, el procesador Python y fn_RedondeoComercial en T-SQL.
 *
 * Tipos de redondeo:
 *  - "exceso"   -> CEILING(P / paso) * paso        (bandas 1-4)
 *  - "unico"    -> precio fijo 4,99                (banda 5)
 *  - "terminal" -> terminal mas cercano por periodo y offsets (bandas 6-12)
 *
 * Regla de desempate: ante distancias iguales, se elige el terminal superior.
 */

export type TipoRedondeo = "exceso" | "unico" | "terminal";
export type EstadoRedondeo = "CALCULADO" | "FUERA_DE_RANGO" | "ALERTA_MARGEN";

export interface Banda {
  numero: number;
  desde: number;
  hasta: number;
  tipo: TipoRedondeo;
  paso: number | null;
  periodo: number | null;
  offsets: number[] | null;
  precioFijo: number | null;
}

export interface ResultadoRedondeo {
  precioRedondeado: number | null;
  estado: EstadoRedondeo;
  banda: { numero: number; intervalo: string } | null;
}

const BANDAS: Banda[] = [
  { numero: 1, desde: 0.01, hasta: 0.5, tipo: "exceso", paso: 0.01, periodo: null, offsets: null, precioFijo: null },
  { numero: 2, desde: 0.51, hasta: 1.0, tipo: "exceso", paso: 0.05, periodo: null, offsets: null, precioFijo: null },
  { numero: 3, desde: 1.01, hasta: 2.5, tipo: "exceso", paso: 0.1, periodo: null, offsets: null, precioFijo: null },
  { numero: 4, desde: 2.51, hasta: 4.75, tipo: "exceso", paso: 0.25, periodo: null, offsets: null, precioFijo: null },
  { numero: 5, desde: 4.76, hasta: 5.15, tipo: "unico", paso: null, periodo: null, offsets: null, precioFijo: 4.99 },
  { numero: 6, desde: 5.16, hasta: 10.15, tipo: "terminal", paso: null, periodo: 1, offsets: [0.29, 0.49, 0.69, 0.99], precioFijo: null },
  { numero: 7, desde: 10.16, hasta: 50.24, tipo: "terminal", paso: null, periodo: 1, offsets: [0.49, 0.99], precioFijo: null },
  { numero: 8, desde: 50.25, hasta: 99.99, tipo: "terminal", paso: null, periodo: 1, offsets: [0.99], precioFijo: null },
  { numero: 9, desde: 100.0, hasta: 500.0, tipo: "terminal", paso: null, periodo: 10, offsets: [3, 5, 7, 9], precioFijo: null },
  { numero: 10, desde: 501.0, hasta: 1000.0, tipo: "terminal", paso: null, periodo: 10, offsets: [0, 5], precioFijo: null },
  { numero: 11, desde: 1001.0, hasta: 5000.0, tipo: "terminal", paso: null, periodo: 100, offsets: [30, 50, 70, 90], precioFijo: null },
  { numero: 12, desde: 5001.0, hasta: 100000.0, tipo: "terminal", paso: null, periodo: 100, offsets: [50, 90], precioFijo: null },
];

const MIN_P = 0.01;
const MAX_P = 100000.0;

function round2(x: number): number {
  return Math.round((x + 1e-12) * 100) / 100;
}

export function clasificarBanda(precio: number): Banda | null {
  if (precio === null || precio === undefined || precio < MIN_P || precio > MAX_P) {
    return null;
  }
  let n = 1;
  for (let i = 0; i < BANDAS.length - 1; i++) {
    if (precio > BANDAS[i].hasta) n++;
  }
  return BANDAS[n - 1];
}

export function redondearPrecioComercial(precio: number): ResultadoRedondeo {
  const banda = clasificarBanda(precio);
  if (banda === null) {
    return { precioRedondeado: null, estado: "FUERA_DE_RANGO", banda: null };
  }
  const intervalo = `${banda.desde.toFixed(2)} - ${banda.hasta.toFixed(2)}`;
  const meta = { numero: banda.numero, intervalo };

  if (banda.tipo === "exceso" && banda.paso !== null) {
    const p = round2(Math.ceil(Number((precio / banda.paso).toFixed(9))) * banda.paso);
    return { precioRedondeado: p, estado: "CALCULADO", banda: meta };
  }
  if (banda.tipo === "unico" && banda.precioFijo !== null) {
    return { precioRedondeado: round2(banda.precioFijo), estado: "CALCULADO", banda: meta };
  }
  // terminal mas cercano
  const d = banda.periodo as number;
  const offsets = banda.offsets as number[];
  const j = Math.floor(precio / d) * d;
  const inferiores = offsets.map((o) => (j + o <= precio ? j + o : j - d + o));
  const superiores = offsets.map((o) => (j + o >= precio ? j + o : j + d + o));
  const s = Math.max(...inferiores);
  const t = Math.min(...superiores);
  // empate -> superior (comparacion estricta)
  const elegido = Number((precio - s).toFixed(6)) < Number((t - precio).toFixed(6)) ? s : t;
  return { precioRedondeado: round2(elegido), estado: "CALCULADO", banda: meta };
}
