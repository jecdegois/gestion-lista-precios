/** Datos maestros del dominio, portados literalmente del mockup MV26020. */

import type { ArticuloCatalogo, Identidad, ProcesoDef, ProcesoKey } from "./domain-types";

export const DOMINIO_A_COMPANIA_S2SS: Record<string, string> = {
  "sillaca.com": "SILLACA",
  "beval.com": "BEVAL",
  "febeca.com": "FEBECA",
  "cofersa.com": "COFERSA",
};

export function resolverCompaniaPorCorreo(email: string): string | null {
  const dominio = String(email || "").split("@")[1] || "";
  return DOMINIO_A_COMPANIA_S2SS[dominio.toLowerCase()] || null;
}

const IDENTIDADES_BASE: Omit<Identidad, "compania">[] = [
  { email: "jperez@sillaca.com", nombre: "Juan Pérez", rol: "OPERADOR", color: "#2563eb" },
  { email: "mrodriguez@sillaca.com", nombre: "María Rodríguez", rol: "APROBADOR", color: "#7c3aed" },
  { email: "palvarado@beval.com", nombre: "Pedro Alvarado", rol: "OPERADOR", color: "#0d9488" },
  { email: "ljimenez@febeca.com", nombre: "Lucía Jiménez", rol: "APROBADOR", color: "#ea580c" },
  { email: "rmoreno@febeca.com", nombre: "Ricardo Moreno", rol: "OPERADOR", color: "#f59e0b" },
  { email: "dvargas@cofersa.com", nombre: "Diego Vargas", rol: "OPERADOR", color: "#b45309" },
  { email: "acastro@cofersa.com", nombre: "Ana Castro", rol: "APROBADOR", color: "#9333ea" },
  { email: "cgomez@sinmapeo.com", nombre: "Carlos Gómez", rol: "SIN_PERMISO", color: "#71717a" },
];

export const IDENTIDADES: Identidad[] = IDENTIDADES_BASE.map((i) => ({
  ...i,
  compania: resolverCompaniaPorCorreo(i.email),
}));

export function buscarIdentidad(email: string): Identidad | undefined {
  return IDENTIDADES.find((i) => i.email === email);
}

export const CATALOGO_ARTICULOS: Record<string, ArticuloCatalogo> = {
  "ART-231": { codigo: "ART-231", descripcion: "Refrigeradora 14 pies", precioActual: 10000, costoReposicion: 7200, margenUtilidadMin: 0.3, categoria: "Electrodomésticos", subcategoria: "Refrigeración", grupo: "Línea Blanca", marca: "Mabe", marcaGrupoCompra: "Línea Blanca", bdf: "BDF-001" },
  "ART-455": { codigo: "ART-455", descripcion: "Microondas 1.2 CF", precioActual: 4200, costoReposicion: 2900, margenUtilidadMin: 0.25, categoria: "Electrodomésticos", subcategoria: "Cocción", grupo: "Línea Blanca", marca: "Oster", marcaGrupoCompra: "Línea Blanca", bdf: "BDF-002" },
  "ART-089": { codigo: "ART-089", descripcion: "Ventilador de Torre", precioActual: 9800, costoReposicion: 10450, margenUtilidadMin: 0.2, categoria: "Hogar", subcategoria: "Climatización", grupo: "Hogar", marca: "Black+Decker", marcaGrupoCompra: "Pequeños Electrodomésticos", bdf: "BDF-003" },
  "ART-120": { codigo: "ART-120", descripcion: "Licuadora 600W", precioActual: 3100, costoReposicion: 3300, margenUtilidadMin: 0.2, categoria: "Electrodomésticos", subcategoria: "Preparación de alimentos", grupo: "Hogar", marca: "Oster", marcaGrupoCompra: "Pequeños Electrodomésticos", bdf: "BDF-002" },
  "ART-344": { codigo: "ART-344", descripcion: "Plancha a Vapor", precioActual: 2500, costoReposicion: 1600, margenUtilidadMin: 0.35, categoria: "Hogar", subcategoria: "Cuidado del Hogar", grupo: "Hogar", marca: "Black+Decker", marcaGrupoCompra: "Pequeños Electrodomésticos", bdf: "BDF-003" },
  "ART-104": { codigo: "ART-104", descripcion: "Cafetera 12 Tazas", precioActual: 6200, costoReposicion: 4400, categoria: "Electrodomésticos", subcategoria: "Preparación de alimentos", grupo: "Línea Blanca", marca: "Hamilton Beach", marcaGrupoCompra: "Línea Blanca", bdf: "BDF-001" },
};

export const MARGEN_MINIMO_GLOBAL = 0.2;

// NOMBRES_LISTA: clave lowercase -> display uppercase.
const LISTAS_FIJAS = ["mayoreod", "mayoreob", "lparagua", "grupopico", "larab"];
export const NOMBRES_LISTA: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const l of LISTAS_FIJAS) m[l] = l.toUpperCase();
  for (let i = 1; i <= 18; i++) m[`lpv${i}`] = `LPV${i}`;
  return m;
})();

export const ARTICULOS_POR_LISTA: Record<string, string[]> = {
  mayoreod: ["ART-231", "ART-455", "ART-120", "ART-344"],
  mayoreob: ["ART-231", "ART-089", "ART-120", "ART-104"],
  lparagua: ["ART-231", "ART-455", "ART-344", "ART-104"],
  grupopico: ["ART-089", "ART-120", "ART-344"],
  larab: ["ART-231", "ART-455", "ART-104"],
  lpv1: ["ART-231", "ART-455"], lpv2: ["ART-089", "ART-120"], lpv3: ["ART-344", "ART-104"],
  lpv4: ["ART-231", "ART-089"], lpv5: ["ART-455", "ART-120"], lpv6: ["ART-344", "ART-104"],
  lpv7: ["ART-231", "ART-120"], lpv8: ["ART-455", "ART-344"], lpv9: ["ART-089", "ART-104"],
  lpv10: ["ART-231", "ART-344"], lpv11: ["ART-455", "ART-104"], lpv12: ["ART-089", "ART-120"],
  lpv13: ["ART-231", "ART-104"], lpv14: ["ART-455", "ART-089"], lpv15: ["ART-120", "ART-344"],
  lpv16: ["ART-231", "ART-455"], lpv17: ["ART-089", "ART-120"], lpv18: ["ART-344", "ART-104"],
};

export const LISTAS_POR_COMPANIA: Record<string, string[]> = {
  SILLACA: LISTAS_FIJAS,
  BEVAL: LISTAS_FIJAS,
  FEBECA: LISTAS_FIJAS,
  COFERSA: Array.from({ length: 18 }, (_, i) => `lpv${i + 1}`),
};

export const GRUPOS_ARTICULOS: Record<string, { label: string; articulos: string[] }> = {
  linea_blanca: { label: "Línea Blanca", articulos: ["ART-231", "ART-455", "ART-104"] },
  hogar: { label: "Hogar", articulos: ["ART-089", "ART-120", "ART-344"] },
};

export const FILTROS_ARTICULOS = {
  categoria: ["Electrodomésticos", "Hogar"],
  subcategoria: ["Refrigeración", "Cocción", "Climatización", "Preparación de alimentos", "Cuidado del Hogar"],
  grupo: ["Línea Blanca", "Hogar"],
  marca: ["Mabe", "Oster", "Black+Decker", "Hamilton Beach"],
  marcaGrupoCompra: ["Línea Blanca", "Pequeños Electrodomésticos", "Hogar"],
  bdf: ["BDF-001", "BDF-002", "BDF-003"],
};

export const LISTA_BASE_OBJETIVO = {
  codigo: "MAYOREOD",
  nombre: "Lista Base",
  nivelPrecio: "MayoreoD",
  versionEstado: "Vigente",
};

export const PROCESOS: Record<ProcesoKey, ProcesoDef> = {
  FACTOR_PRECIO: {
    label: "Gestión Global",
    desc: "Ajuste global manual por lista de precio mediante un factor.",
    ejecucion: "Actualización automatizada autorizada",
    modo: "factor",
  },
  MAYOREOD_MASIVO: {
    label: "Actualización Masiva de Precios",
    desc: "Actualización crítica de la Lista Base configurada por Grupo de Artículos y versión aprobada.",
    ejecucion: "Actualización automatizada autorizada",
    modo: "factor",
  },
  DESCUENTO_LISTA_PRECIO: {
    label: "Descuento por Artículo",
    desc: "Configuración manual o masiva de descuentos por lista y artículo autorizado.",
    ejecucion: "Actualización automatizada autorizada",
    modo: "factor",
  },
  MARGEN_UTILIDAD_MASIVO: {
    label: "Carga Masiva de Margen de Utilidad",
    desc: "Carga masiva del porcentaje de reducción por artículo para recalcular el Margen Mínimo de Utilidad (Regla de Mayoreo).",
    ejecucion: "Recalculo de margen mínimo autorizado",
    modo: "margen",
  },
};

export const TIPOS_VARIACION: Record<string, string> = { AUMENTO: "Aumento", DISMINUCION: "Disminución" };

export function estaEnAmbito(
  compania: string | null | undefined,
  companiaSolicitud: string | null | undefined,
  listaCodigo: string | null | undefined,
): boolean {
  if (!compania) return false;
  if (companiaSolicitud && companiaSolicitud !== compania) return false;
  if (listaCodigo && (LISTAS_POR_COMPANIA[compania] || []).indexOf(listaCodigo) === -1) return false;
  return true;
}

export function margenMinimoEfectivo(articulo: ArticuloCatalogo | undefined): number {
  if (articulo && typeof articulo.margenUtilidadMin === "number" && articulo.margenUtilidadMin > 0) {
    return articulo.margenUtilidadMin;
  }
  return MARGEN_MINIMO_GLOBAL;
}

export function calcularCostoMinimoArticulo(articulo: ArticuloCatalogo | undefined): number | null {
  if (!articulo || typeof articulo.costoReposicion !== "number") return null;
  const margen = margenMinimoEfectivo(articulo);
  if (margen <= 0 || margen >= 1) return articulo.costoReposicion;
  return articulo.costoReposicion / (1 - margen);
}
