import { NextResponse } from "next/server";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";
import { getIdentidadActual } from "@/utils/auth";

const DEFAULT_MAX_RECORDS = 50;
const SERVER_MAX_RECORDS = 100;

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
  const nivelPrecio = url.searchParams.get("nivelPrecio")?.trim() ?? "";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const offset = parseNonNegativeInteger(url.searchParams.get("offset"), 0);
  const requestedMax = parseNonNegativeInteger(url.searchParams.get("maxRecords"), DEFAULT_MAX_RECORDS);
  const maxRecords = Math.min(Math.max(requestedMax || DEFAULT_MAX_RECORDS, 1), SERVER_MAX_RECORDS);

  if (!compania || !nivelPrecio) {
    return NextResponse.json(
      { error: "compania y nivelPrecio son parámetros obligatorios." },
      { status: 400 },
    );
  }

  try {
    const page = await solicitudesService.paginaArticulos(identidad, nivelPrecio, search, offset, maxRecords);
    if (!page.ok) return NextResponse.json({ error: page.error }, { status: 400 });
    return NextResponse.json({
      items: page.items,
      offset: page.offset,
      maxRecords: page.maxRecords,
      hasMore: page.hasMore,
      nextOffset: page.nextOffset,
    });
  } catch (error) {
    console.error("No fue posible consultar la página de artículos.", error);
    return NextResponse.json(
      { error: "No fue posible consultar los artículos de la lista de precio." },
      { status: 500 },
    );
  }
}
