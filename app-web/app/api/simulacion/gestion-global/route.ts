import { NextResponse } from "next/server";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";
import { getIdentidadActual } from "@/utils/auth";

function parseNonNegativeInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const identidad = await getIdentidadActual();
  if (!identidad || identidad.rol === "SIN_PERMISO") {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }
  const url = new URL(request.url);
  // La compañía sale de la sesión; el parámetro `compania` se ignora.
  const compania = identidad.compania ?? "";
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
    const resultado = await solicitudesService.simularGestionGlobal(identidad, {
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
