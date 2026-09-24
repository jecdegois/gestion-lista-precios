import Dropdown, { type SelectOption } from "@/components/newComponents/Dropdown";
import type { ArticuloCatalogo, CriteriosArticulo } from "@/lib/domain-types";
import type { Classification } from "../../../utils/classifications";
import PercentInput from "../shared/PercentInput";
import ClassificationFilters from "./ClassificationFilters";

/** Captura manual de Precio Base: lista, criterios, descuento y confirmación del alcance. */
export default function BasePriceManualCapture({
  level,
  levelName,
  levelOptions,
  articles,
  criteria,
  factor,
  factorError,
  articleCount,
  acknowledged,
  simulationError,
  disabled,
  loading,
  onLevelChange,
  onCriterionChange,
  onFactorChange,
  onAcknowledgedChange,
}: {
  level: string;
  levelName: string;
  levelOptions: SelectOption[];
  articles: ArticuloCatalogo[];
  criteria: CriteriosArticulo;
  factor: string;
  factorError: string | null;
  articleCount: number;
  acknowledged: boolean;
  simulationError: string | null;
  disabled: boolean;
  loading: boolean;
  onLevelChange: (level: string) => void;
  onCriterionChange: (classification: Classification, value: string) => void;
  onFactorChange: (factor: string) => void;
  onAcknowledgedChange: (acknowledged: boolean) => void;
}) {
  return (
    <div className="space-y-4 mb-4">
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
        <p className="font-semibold">
          ⚠️ Atención: esta actualización aplicará cambios sobre la lista {levelName} cuando sea autorizada.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        <Dropdown
          id="nivel-mayoreod"
          modelValue={level}
          onChange={onLevelChange}
          options={levelOptions}
          label="Lista de Precio"
          placeholder="Seleccionar lista..."
          searchable={false}
          disabled={disabled}
          loading={loading}
        />
        <ClassificationFilters
          articles={articles}
          criteria={criteria}
          disabled={disabled || !level}
          loading={loading}
          onChange={onCriterionChange}
        />
        <PercentInput
          id="descuento-mayoreod"
          label="Descuento %"
          value={factor}
          disabled={disabled}
          error={factorError}
          onChange={onFactorChange}
        />
      </div>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <b>{articleCount}</b> artículo(s) coinciden con la lista y los criterios seleccionados.
        {articleCount === 0 && (
          <p className="mt-1 text-xs text-amber-700">Seleccione criterios con artículos resultantes antes de simular.</p>
        )}
      </div>
      <label className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 cursor-pointer select-none max-w-xl">
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={disabled}
          onChange={(e) => onAcknowledgedChange(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span className="text-sm">
          Entiendo que esta solicitud aplicará cambios sobre los <b>{articleCount}</b> artículos resultantes de la lista y
          criterios seleccionados cuando un aprobador la autorice.
        </span>
      </label>
      {simulationError && <p className="text-[11px] text-red-600">{simulationError}</p>}
    </div>
  );
}
