import Icon from "@/components/Icon";

export default function MarginInstructions() {
  return (
    <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-900 mb-4">
      <p className="font-semibold flex items-center gap-1.5">
        <Icon name="fileSpreadsheet" className="w-4 h-4" /> Carga masiva del porcentaje de reducción de margen (Regla de Mayoreo)
      </p>
      <p className="text-xs mt-1 text-indigo-800">
        Cargue por artículo el <b>Porcentaje de Reducción</b> (ej. <b>10 = 10%</b>). El aplicativo normaliza a <b>0.10</b>, aplica el
        multiplicador <b>0.90</b> y persiste el Margen Mínimo en <span className="mono">ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN</span> al
        aprobar.
      </p>
    </div>
  );
}
