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
