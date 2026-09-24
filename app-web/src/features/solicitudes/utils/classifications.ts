import type { SelectOption } from "@/components/newComponents/Dropdown";
import type { ArticuloCatalogo, CriteriosArticulo } from "@/lib/domain-types";

/** Clasificaciones de artículo en cascada usadas como criterios de Precio Base. */
export const CLASSIFICATIONS = [
  { key: "clasificacion1", label: "Grupo", value: "grupo", description: "grupoDescripcion" },
  { key: "clasificacion2", label: "Categoria", value: "subcategoria", description: "subcategoriaDescripcion" },
  { key: "clasificacion3", label: "Marca", value: "marca", description: "marcaDescripcion" },
  { key: "clasificacion4", label: "BDF", value: "bdf", description: "bdfDescripcion" },
  { key: "clasificacion5", label: "Grupo Compra", value: "marcaGrupoCompra", description: "marcaGrupoCompraDescripcion" },
] as const satisfies readonly {
  key: keyof CriteriosArticulo;
  label: string;
  value: keyof ArticuloCatalogo;
  description: keyof ArticuloCatalogo;
}[];

export type Classification = (typeof CLASSIFICATIONS)[number];

function text(article: ArticuloCatalogo, field: keyof ArticuloCatalogo): string {
  return String(article[field] ?? "").trim();
}

/** Artículos que cumplen los criterios de las primeras `upTo` clasificaciones. */
export function filterByCriteria(articles: ArticuloCatalogo[], criteria: CriteriosArticulo, upTo: number = CLASSIFICATIONS.length) {
  return articles.filter((article) =>
    CLASSIFICATIONS.slice(0, upTo).every(({ key, value }) => !criteria[key] || text(article, value) === criteria[key]),
  );
}

/** Opciones de la clasificación `index`, acotadas por las clasificaciones anteriores. */
export function classificationOptions(articles: ArticuloCatalogo[], criteria: CriteriosArticulo, index: number): SelectOption[] {
  const { value, description } = CLASSIFICATIONS[index];
  const descriptions = new Map<string, string>();
  for (const article of filterByCriteria(articles, criteria, index)) {
    const code = text(article, value);
    if (code && !descriptions.has(code)) descriptions.set(code, text(article, description));
  }
  return Array.from(descriptions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, desc]) => ({ value: code, label: desc ? `${code} — ${desc}` : code, searchText: `${code} ${desc}` }));
}

/** Cambia un criterio y limpia los que dependen de él (los siguientes en la cascada). */
export function setCriterion(criteria: CriteriosArticulo, classification: Classification, value: string): CriteriosArticulo {
  const index = CLASSIFICATIONS.indexOf(classification);
  const next: CriteriosArticulo = { ...criteria, [classification.key]: value || undefined };
  CLASSIFICATIONS.slice(index + 1).forEach(({ key }) => {
    next[key] = undefined;
  });
  return next;
}
