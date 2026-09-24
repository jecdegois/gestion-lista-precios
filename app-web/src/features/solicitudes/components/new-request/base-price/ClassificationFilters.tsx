import Dropdown from "@/components/newComponents/Dropdown";
import type { ArticuloCatalogo, CriteriosArticulo } from "@/lib/domain-types";
import { CLASSIFICATIONS, classificationOptions, type Classification } from "../../../utils/classifications";

/** Un selector por clasificación; cada uno se acota con los criterios anteriores. */
export default function ClassificationFilters({
  articles,
  criteria,
  disabled,
  loading,
  onChange,
}: {
  articles: ArticuloCatalogo[];
  criteria: CriteriosArticulo;
  disabled: boolean;
  loading: boolean;
  onChange: (classification: Classification, value: string) => void;
}) {
  return (
    <>
      {CLASSIFICATIONS.map((classification, index) => {
        const options = classificationOptions(articles, criteria, index);
        return (
          <Dropdown
            key={classification.key}
            id={`criterio-${classification.key}`}
            modelValue={criteria[classification.key] ?? ""}
            onChange={(value) => onChange(classification, value)}
            options={options}
            label={classification.label}
            placeholder={`Seleccionar ${classification.label.toLowerCase()}...`}
            searchable
            disabled={disabled || options.length === 0}
            loading={loading}
          />
        );
      })}
    </>
  );
}
