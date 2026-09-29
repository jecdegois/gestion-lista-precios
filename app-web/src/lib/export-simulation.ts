import * as XLSX from "xlsx";
import type { FilaMargen, FilaPrecio, FilaResultado } from "./domain-types";

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

/**
 * Descarga todas las filas recibidas de una simulación en un libro Excel.
 *
 * @param filas           - Filas de resultados a exportar.
 * @param nombre          - Nombre del archivo de salida.
 * @param etiquetaVariacion - Encabezado de la columna de variación (Descuento % / Variación %).
 * @param mensajeListaBase  - Cuando se recibe, omite la columna "Lista" de los datos y agrega
 *                            una hoja "Información" con la nota descriptiva de la lista padre.
 * @param modo            - "precioBase" genera solo las columnas relevantes para Precio Base.
 */
export function descargarSimulacionExcel(
  filas: FilaResultado[],
  nombre = "simulacion-precios.xlsx",
  etiquetaVariacion = "Descuento %",
  mensajeListaBase?: string,
  modo?: "precioBase",
): void {
  const omitirColumnaLista = Boolean(mensajeListaBase);

  // Exportación simplificada para Precio Base: solo columnas relevantes.
  if (modo === "precioBase") {
    const rows = filas.map((fila) => {
      const v = fila.validacion;
      const estado = v.valido
        ? "VÁLIDO"
        : v.estadoRedondeo === "ALERTA_MARGEN"
          ? "ADVERTENCIA MARGEN"
          : "INVÁLIDO";
      return {
        "Código": fila.codigo,
        "Descripción": fila.descripcion,
        "Precio Actual": numero(v.precioActual) ?? "",
        "Precio Calc.": numero(v.precioPropuesto) ?? "",
        "Precio Mínimo": numero(v.costoMinimo) ?? "",
        "Estado": estado,
        "Causa": v.causa ?? fila.mensajeError ?? "",
      };
    });
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [
      { wch: 18 }, // Código
      { wch: 34 }, // Descripción
      { wch: 16 }, // Precio Actual
      { wch: 16 }, // Precio Calc.
      { wch: 16 }, // Precio Mínimo
      { wch: 22 }, // Estado
      { wch: 55 }, // Causa
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, "Simulación Precio Base");
    XLSX.writeFile(workbook, nombre);
    return;
  }

  const rows = filas.map((fila) => {
    const v = fila.validacion;
    const esMargen = "porcentajeReduccion" in fila;
    const filaMargen = fila as FilaMargen;
    const filaPrecio = fila as FilaPrecio;

    // Cuando hay lista base definida, la columna "Lista" se omite y la información
    // queda disponible en la hoja "Información" del mismo libro.
    const base = {
      Fila: fila.fila,
      ...(omitirColumnaLista ? {} : { Lista: fila.lista ?? "" }),
      "Código Artículo": fila.codigo,
      Descripción: fila.descripcion,
      [etiquetaVariacion]: esMargen ? numero(filaMargen.validacion.porcentajeReduccion) : filaPrecio.variacionPorcentaje ?? "",
      Multiplicador: esMargen ? numero(filaMargen.validacion.multiplicadorMargen) : filaPrecio.multiplicador ?? filaPrecio.factorPropuesto ?? "",
      "Precio Actual": numero(v.precioActual) ?? "",
      "Precio Calculado": numero(v.precioPropuesto) ?? "",
      "Precio Redondeado": numero(v.precioRedondeado) ?? "",
      "Costo Mínimo": numero(v.costoMinimo) ?? "",
      Estado: v.valido ? "VÁLIDO" : "INVÁLIDO",
      Causa: v.causa ?? fila.mensajeError ?? "",
    };
    return base;
  });

  const workbook = XLSX.utils.book_new();

  // Hoja principal con los datos de simulación.
  const sheet = XLSX.utils.json_to_sheet(rows);
  if (omitirColumnaLista) {
    // Sin columna Lista: 12 columnas → anchos ajustados.
    sheet["!cols"] = [
      { wch: 8 },  // Fila
      { wch: 18 }, // Código Artículo
      { wch: 34 }, // Descripción
      { wch: 14 }, // etiquetaVariacion
      { wch: 16 }, // Multiplicador
      { wch: 16 }, // Precio Actual
      { wch: 16 }, // Precio Calculado
      { wch: 18 }, // Precio Redondeado
      { wch: 18 }, // Costo Mínimo
      { wch: 16 }, // Estado
      { wch: 14 }, // Causa
    ];
  } else {
    sheet["!cols"] = [
      { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 34 }, { wch: 14 }, { wch: 16 },
      { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 55 },
    ];
  }
  XLSX.utils.book_append_sheet(workbook, sheet, "Simulación completa");

  // Hoja informativa cuando los precios se calcularon desde una lista padre.
  if (mensajeListaBase) {
    const infoRows = [
      { Información: mensajeListaBase },
      { Información: "La columna 'Lista' no se incluye en este reporte porque todos los precios corresponden a la lista base indicada arriba." },
    ];
    const infoSheet = XLSX.utils.json_to_sheet(infoRows);
    infoSheet["!cols"] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(workbook, infoSheet, "Información");
  }

  XLSX.writeFile(workbook, nombre);
}
