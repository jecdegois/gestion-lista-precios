import * as XLSX from "xlsx";
import type { FilaMargen, FilaPrecio, FilaResultado } from "./domain-types";

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

/** Descarga todas las filas recibidas de una simulación en un libro Excel. */
export function descargarSimulacionExcel(filas: FilaResultado[], nombre = "simulacion-precios.xlsx", etiquetaVariacion = "Descuento %"): void {
  const rows = filas.map((fila) => {
    const v = fila.validacion;
    const esMargen = "porcentajeReduccion" in fila;
    const filaMargen = fila as FilaMargen;
    const filaPrecio = fila as FilaPrecio;
    return {
      Fila: fila.fila,
      Lista: fila.lista ?? "",
      "Código Artículo": fila.codigo,
      Descripción: fila.descripcion,
      [etiquetaVariacion]: esMargen ? numero(filaMargen.validacion.porcentajeReduccion) : filaPrecio.variacionPorcentaje ?? "",
      Multiplicador: esMargen ? numero(filaMargen.validacion.multiplicadorMargen) : filaPrecio.multiplicador ?? filaPrecio.factorPropuesto ?? "",
      "Factor Aplicado": fila.factorAplicado ?? "",
      "Precio Actual": numero(v.precioActual) ?? "",
      "Precio Calculado": numero(v.precioPropuesto) ?? "",
      "Precio Redondeado": numero(v.precioRedondeado) ?? "",
      "Costo Mínimo": numero(v.costoMinimo) ?? "",
      Estado: v.valido ? "VÁLIDO" : "INVÁLIDO",
      Causa: v.causa ?? fila.mensajeError ?? "",
    };
  });
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 34 }, { wch: 14 }, { wch: 16 },
    { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 55 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Simulación completa");
  XLSX.writeFile(workbook, nombre);
}
