import Icon from "@/components/Icon";
import Dropdown, { type SelectOption } from "@/components/newComponents/Dropdown";
import TablaArticulosCapturaManual, { type ArticuloCapturaManualRow } from "@/components/newComponents/TablaArticulosCapturaManual";
import type { PreviewRedondeo } from "@/lib/preview";
import { ARTICLES_PAGE_SIZE, type useArticleSearch } from "../../../hooks/useArticleSearch";
import PercentInput from "../shared/PercentInput";
import ArticleSummary from "./ArticleSummary";

type ArticleSearch = ReturnType<typeof useArticleSearch>;

/** Captura manual de Descuento: lista, artículo, descuento y tabla de artículos agregados. */
export default function DiscountManualCapture({
  level,
  levelOptions,
  catalogReady,
  loadingCatalog,
  search,
  factor,
  canAdd,
  preview,
  items,
  itemError,
  disabled,
  onLevelChange,
  onFactorChange,
  onAdd,
  onRemove,
}: {
  level: string;
  levelOptions: SelectOption[];
  /** El catálogo cargó sin error y tiene listas: se puede pedir que elija una. */
  catalogReady: boolean;
  loadingCatalog: boolean;
  search: ArticleSearch;
  factor: string;
  canAdd: boolean;
  preview: PreviewRedondeo | null;
  items: ArticuloCapturaManualRow[];
  itemError: string | null;
  disabled: boolean;
  onLevelChange: (level: string) => void;
  onFactorChange: (factor: string) => void;
  onAdd: () => void;
  onRemove: (code: string, listCode: string) => void;
}) {
  const articleOptions: SelectOption[] = search.options.map((a) => ({
    value: a.codigo,
    label: `${a.codigo} — ${a.descripcion}`,
    searchText: `${a.codigo} ${a.descripcion}`,
  }));

  return (
    <div className="space-y-4 mb-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Dropdown
          id="nivel-desc"
          modelValue={level}
          onChange={onLevelChange}
          options={levelOptions}
          label="Lista de Precio"
          placeholder="Seleccionar lista..."
          searchable={false}
          disabled={disabled}
          loading={loadingCatalog}
        />
        <Dropdown
          id="codigo-articulo"
          modelValue={search.selected?.codigo ?? ""}
          onChange={(value) => search.setSelected(search.options.find((a) => a.codigo === value) ?? null)}
          options={articleOptions}
          label="Código de Artículo"
          placeholder="Buscar por código o nombre..."
          searchPlaceholder="Buscar por código o nombre..."
          emptyText="No se encontraron artículos por código o nombre."
          searchable
          maxRecords={ARTICLES_PAGE_SIZE}
          hasMore={search.hasMore}
          nextOffset={search.nextOffset}
          loading={search.loading}
          loadingMore={search.loadingMore}
          debounceMs={500}
          onSearch={search.load}
          onLoadMore={search.load}
          disabled={disabled}
        />
        <PercentInput id="descuento-desc" label="Descuento %" value={factor} disabled={disabled} onChange={onFactorChange} />
      </div>
      {!level && catalogReady && (
        <p className="text-xs text-zinc-500">Seleccione una lista de precio para consultar los artículos disponibles.</p>
      )}
      {!!level && !search.loading && !search.error && search.articles.length === 0 && (
        <p className="text-xs text-amber-700">La lista seleccionada no tiene artículos con versión activa.</p>
      )}
      {search.selected && <ArticleSummary article={search.selected} preview={preview} />}
      <button className="btn btn-outline" disabled={!canAdd} onClick={onAdd}>
        <Icon name="plus" className="w-3.5 h-3.5" /> Agregar artículo
      </button>
      {itemError && <p className="text-[11px] text-red-600">{itemError}</p>}
      {items.length > 0 && <TablaArticulosCapturaManual filas={items} disabled={disabled} onRemove={onRemove} />}
    </div>
  );
}
