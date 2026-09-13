import * as XLSX from "xlsx";

export async function GET(request: Request) {
  const proceso = new URL(request.url).searchParams.get("proceso");
  const esDescuento = proceso === "DESCUENTO_LISTA_PRECIO";
  const encabezado = esDescuento
    ? ["Lista de Precio", "Codigo Articulo", "Factor Multiplicador"]
    : ["Codigo Articulo", "Porcentaje Reduccion"];
  const anchos = esDescuento ? [{ wch: 22 }, { wch: 18 }, { wch: 24 }] : [{ wch: 18 }, { wch: 24 }];
  const nombreArchivo = esDescuento ? "plantilla-descuento-lista-precio.xlsx" : "plantilla-margen-utilidad.xlsx";
  const sheet = XLSX.utils.aoa_to_sheet([encabezado]);
  sheet["!cols"] = anchos;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Plantilla");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
