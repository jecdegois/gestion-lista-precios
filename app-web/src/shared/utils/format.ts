/** Utilidades de formato compartidas por la UI. */

import type { Identidad } from "@/shared/types/domain-types";

/**
 * Fecha/hora leída de SQL Server. Los datetime guardan la hora local del servidor (GETDATE()) y
 * Prisma los entrega como si fueran UTC: se formatea en UTC para mostrar esa hora tal cual,
 * sin importar el huso del servidor de la app ni del navegador.
 */
export function fmtFechaBd(
  valor: Date | string | null | undefined,
  opciones: Intl.DateTimeFormatOptions = { hour12: false },
): string {
  if (!valor) return "—";
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-CR", { ...opciones, timeZone: "UTC" });
}

export function fmtMonto(n: number | null | undefined, moneda = ""): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  const monto = n.toLocaleString("es-CR", { maximumFractionDigits: 2 });
  return moneda ? `${moneda} ${monto}` : monto;
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

/** Formatea un porcentaje ya capturado sin exponer decimales técnicos.
 *  Los descuentos se expresan siempre como valor positivo (ej. -20 → "20%"). */
export function fmtPorcentajeCapturado(x: number | string | null | undefined): string {
  if (x == null || String(x).trim() === "") return "—";
  const numero = Math.abs(Number(String(x).replace(",", ".")));
  if (!Number.isFinite(numero)) return String(x);
  return `${numero.toLocaleString("es-CR", { maximumFractionDigits: 4 })}%`;
}

/** Rol para mostrar; un administrador sin rol en la compañía se muestra como ADMINISTRADOR. */
export function roleLabel(user: Pick<Identidad, "rol" | "isAdmin">): string {
  return user.rol === "SIN_PERMISO" && user.isAdmin ? "ADMINISTRADOR" : user.rol.replace("_", " ");
}
