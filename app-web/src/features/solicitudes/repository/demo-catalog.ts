import "server-only";
import type { Articulo, NivelPrecio } from "@/lib/types";

/**
 * Catalogo en memoria por compania para DEMO_MODE. Permite ejecutar el portal
 * sin una base de datos SQL Server disponible. Los precios/costos reproducen
 * los del mockup para mantener resultados coherentes de margen y redondeo.
 */
const CATALOGO_BASE: Articulo[] = [
  { codigo: "ART-231", descripcion: "Refrigeradora 14 pies", precioLista: 10000, costoPromedio: 7200 },
  { codigo: "ART-455", descripcion: "Microondas 1.2 CF", precioLista: 4200, costoPromedio: 2900 },
  { codigo: "ART-089", descripcion: "Ventilador de Torre", precioLista: 9800, costoPromedio: 10450 },
  { codigo: "ART-120", descripcion: "Licuadora 600W", precioLista: 3100, costoPromedio: 3300 },
  { codigo: "ART-344", descripcion: "Plancha a Vapor", precioLista: 2500, costoPromedio: 1600 },
  { codigo: "ART-104", descripcion: "Cafetera 12 Tazas", precioLista: 6200, costoPromedio: 4400 },
];

/**
 * Excepciones de factor de reduccion (porcentaje explicito, como en la UDF
 * real U_FACTOR_REDUCCION_MARGEN). Simula filas con U_ACTIVO = 'S'.
 */
const EXCEPCIONES_UDF: Record<string, Record<string, number>> = {
  COFER: { "ART-231": 15.0, "ART-455": 5.0 },
};

export function catalogoDemo(_compania: string): Articulo[] {
  // El mismo catalogo base sirve para todas las companias en demo.
  return CATALOGO_BASE.map((a) => ({ ...a }));
}

export function buscarArticuloDemo(_compania: string, codigo: string): Articulo | undefined {
  return CATALOGO_BASE.find((a) => a.codigo === codigo.trim().toUpperCase());
}

/** Porcentaje de reduccion vigente en la "UDF" demo, o null si no hay excepcion. */
export function porcentajeUdfDemo(compania: string, codigo: string): number | null {
  const porCompania = EXCEPCIONES_UDF[compania.toUpperCase()];
  if (!porCompania) return null;
  const p = porCompania[codigo.trim().toUpperCase()];
  return p === undefined ? null : p;
}

/** Upsert del porcentaje en la "UDF" demo (simula el llenado de la tabla real). */
export function upsertUdfDemo(compania: string, codigo: string, porcentaje: number): void {
  const clave = compania.toUpperCase();
  if (!EXCEPCIONES_UDF[clave]) EXCEPCIONES_UDF[clave] = {};
  EXCEPCIONES_UDF[clave][codigo.trim().toUpperCase()] = porcentaje;
}

const NIVELES_DEMO: NivelPrecio[] = [
  { codigo: "MAYOREOB", nombre: "MAYOREOB" },
  { codigo: "LPARAGUA", nombre: "LPARAGUA" },
  { codigo: "GRUPOPICO", nombre: "GRUPOPICO" },
  { codigo: "LARAB", nombre: "LARAB" },
  { codigo: "MAYOREOD", nombre: "MAYOREOD" },
];

export function nivelesPrecioDemo(_compania: string): NivelPrecio[] {
  return NIVELES_DEMO.map((nivel) => ({ ...nivel }));
}
