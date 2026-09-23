import { NextResponse } from "next/server";
import { simularGestionGlobalPaginado } from "@/app/actions";

function parseNonNegativeInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const compania = url.searchParams.get("compania")?.trim().toUpperCase() ?? "";
  const nivel = url.searchParams.get("nivel")?.trim() ?? "";
  const factor = url.searchParams.get("factor")?.trim() ?? "";
  const tipoVariacion = url.searchParams.get("tipoVariacion") === "DISMINUCION" ? "DISMINUCION" : "AUMENTO";
  const offset = parseNonNegativeInteger(url.searchParams.get("offset"), 0);
  const maxRecords = Math.min(Math.max(parseNonNegativeInteger(url.searchParams.get("maxRecords"), 200) || 200, 1), 200);
  const soloHallazgos = url.searchParams.get("soloHallazgos") === "1";

  if (!compania || !nivel) {
    return NextResponse.json({ error: "compania y nivel son parámetros obligatorios." }, { status: 400 });
  }

  try {
    const resultado = await simularGestionGlobalPaginado({
      compania,
      nivel,
      factor,
      tipoVariacion,
      offset,
      maxRecords,
      soloHallazgos,
    });
    if (!resultado.ok) return NextResponse.json(resultado, { status: 400 });
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("No fue posible simular la Gestión Global por página.", error);
    return NextResponse.json({ error: "No fue posible calcular la página de impacto." }, { status: 500 });
  }
}
