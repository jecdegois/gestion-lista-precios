import type { EntryMode } from "../../../types";

export default function EntryModeTabs({ mode, onChange }: { mode: EntryMode; onChange: (mode: EntryMode) => void }) {
  return (
    <div className="flex gap-2 mb-4">
      <span className={"subtab" + (mode === "manual" ? " active" : "")} onClick={() => onChange("manual")}>
        Captura Manual
      </span>
      <span className={"subtab" + (mode === "excel" ? " active" : "")} onClick={() => onChange("excel")}>
        Carga por Plantilla Excel
      </span>
    </div>
  );
}
