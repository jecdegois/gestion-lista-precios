import * as XLSX from "xlsx";

/**
 * Genera y descarga la plantilla oficial de carga masiva de margen con los
 * encabezados vigentes: "Codigo Articulo" y "Porcentaje Reduccion" (10 = 10%).
 * No incluye la columna legada "Factor Reduccion".
 */
export async function GET() {
  const encabezado = ["Codigo Articulo", "Porcentaje Reduccion"];
  const ejemplos = [
    ["ART-231", 10],
    ["ART-455", 15],
  ];
  const sheet = XLSX.utils.aoa_to_sheet([encabezado, ...ejemplos]);
  sheet["!cols"] = [{ wch: 18 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Plantilla");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-margen-utilidad.xlsx"',
    },
  });
}
