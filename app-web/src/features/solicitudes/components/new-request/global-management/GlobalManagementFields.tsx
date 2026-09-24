import Dropdown, { type SelectOption } from "@/components/newComponents/Dropdown";
import { fmtFactor } from "@/lib/format";
import type { TipoVariacion } from "@/lib/domain-types";
import type { GestionGlobalLista } from "@/lib/types";
import type { Variacion } from "@/lib/engine";
import PercentInput from "../shared/PercentInput";

const VARIATION_OPTIONS: SelectOption[] = [
  { value: "AUMENTO", label: "Aumento" },
  { value: "DISMINUCION", label: "Descuento" },
];

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-500 mb-1.5">{label}</label>
      <input className="input bg-zinc-50" value={value} readOnly aria-readonly="true" />
    </div>
  );
}

/** Lista, versión y variación actual (solo lectura), tipo de variación y variación %. */
export default function GlobalManagementFields({
  level,
  levelOptions,
  selectedList,
  variationType,
  factor,
  conversion,
  disabled,
  loadingCatalog,
  onLevelChange,
  onVariationTypeChange,
  onFactorChange,
}: {
  level: string;
  levelOptions: SelectOption[];
  selectedList?: GestionGlobalLista;
  variationType: TipoVariacion;
  factor: string;
  conversion: Variacion;
  disabled: boolean;
  loadingCatalog: boolean;
  onLevelChange: (level: string) => void;
  onVariationTypeChange: (type: TipoVariacion) => void;
  onFactorChange: (factor: string) => void;
}) {
  const invalidFactor = factor !== "" && !conversion.valido;
  const multiplierHint =
    factor !== "" && conversion.factor != null ? (
      <>Multiplicador: <b className="mono">{fmtFactor(conversion.factor)}</b></>
    ) : undefined;

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 max-w-6xl mb-4">
      <Dropdown
        id="nivel-gg"
        modelValue={level}
        onChange={onLevelChange}
        options={levelOptions}
        label="Lista de Precio"
        placeholder="Seleccionar lista..."
        searchable={false}
        disabled={disabled}
        loading={loadingCatalog}
      />
      <ReadOnlyField label="Versión" value={selectedList?.version ?? "—"} />
      <ReadOnlyField
        label="Variación actual (%)"
        value={selectedList?.variacionPorc != null ? `${selectedList.variacionPorc}%` : "—"}
      />
      <Dropdown
        id="tipo-variacion-gg"
        modelValue={variationType}
        onChange={(value) => onVariationTypeChange(value as TipoVariacion)}
        options={VARIATION_OPTIONS}
        label="Tipo de variación"
        searchable={false}
        disabled={disabled}
      />
      <PercentInput
        id="variacion-gg"
        label="Variación %"
        value={factor}
        disabled={disabled}
        error={invalidFactor ? conversion.causa : null}
        hint={multiplierHint}
        onChange={onFactorChange}
      />
    </div>
  );
}
