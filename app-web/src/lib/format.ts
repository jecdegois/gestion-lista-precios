/** Utilidades de formato compartidas por la UI. */

export function fmtMonto(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return "₡" + n.toLocaleString("es-CR", { maximumFractionDigits: 2 });
}

export function fmtPct(x: number | null | undefined): string {
  if (typeof x !== "number" || Number.isNaN(x)) return "—";
  return (x * 100).toFixed(2) + "%";
}

export function fmtFactor(x: number | null | undefined): string {
  if (typeof x !== "number" || Number.isNaN(x)) return "—";
  return x.toFixed(4);
}

/** Convierte un multiplicador persistido a la variación porcentual amigable. */
export function fmtPorcentajeMultiplicador(x: number | null | undefined): string {
  if (typeof x !== "number" || Number.isNaN(x)) return "—";
  if (x === 0) return "0%";
  return `${((x - 1) * 100).toLocaleString("es-CR", { maximumFractionDigits: 4 })}%`;
}

/** Formatea un porcentaje ya capturado sin exponer decimales técnicos. */
export function fmtPorcentajeCapturado(x: number | string | null | undefined): string {
  if (x == null || String(x).trim() === "") return "—";
  const numero = Number(String(x).replace(",", "."));
  if (!Number.isFinite(numero)) return String(x);
  return `${numero.toLocaleString("es-CR", { maximumFractionDigits: 4 })}%`;
}
