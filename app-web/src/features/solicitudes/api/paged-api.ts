import type { ArticuloCatalogo, FilaPrecio, TipoVariacion } from "@/lib/domain-types";

export type GlobalManagementPage = { filas: FilaPrecio[]; hasMore: boolean; nextOffset: number | null };

export type GlobalManagementPageParams = {
  level: string;
  factor: string;
  variationType: TipoVariacion;
  offset: number;
  maxRecords: number;
  findingsOnly?: boolean;
};

/** Página del impacto de Gestión Global; numera las filas según el offset. */
export async function fetchGlobalManagementPage(params: GlobalManagementPageParams, signal?: AbortSignal): Promise<GlobalManagementPage> {
  const query = new URLSearchParams({
    nivel: params.level,
    factor: params.factor,
    tipoVariacion: params.variationType,
    offset: String(params.offset),
    maxRecords: String(params.maxRecords),
  });
  if (params.findingsOnly) query.set("soloHallazgos", "1");
  const response = await fetch(`/api/simulacion/gestion-global?${query.toString()}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("No fue posible calcular la página de impacto de Gestión Global.");
  const page = (await response.json()) as GlobalManagementPage & { ok: boolean; error?: string };
  if (!page.ok || !Array.isArray(page.filas)) throw new Error(page.error ?? "La respuesta de simulación no tiene un formato válido.");
  return { ...page, filas: page.filas.map((row, index) => ({ ...row, fila: params.offset + index + 1 })) };
}

export type ArticlesPage = { items: ArticuloCatalogo[]; hasMore: boolean; nextOffset: number | null };

/** Página de artículos de una lista de precio, filtrada por código o nombre. */
export async function fetchArticlesPage(
  params: { level: string; query: string; offset: number; maxRecords: number },
  signal?: AbortSignal,
): Promise<ArticlesPage> {
  const query = new URLSearchParams({
    nivelPrecio: params.level,
    search: params.query,
    offset: String(params.offset),
    maxRecords: String(params.maxRecords),
  });
  const response = await fetch(`/api/catalogo/articulos?${query.toString()}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("No fue posible consultar los artículos de la lista de precio.");
  const page = (await response.json()) as ArticlesPage;
  if (!Array.isArray(page.items)) throw new Error("La respuesta de artículos no tiene un formato válido.");
  return page;
}
