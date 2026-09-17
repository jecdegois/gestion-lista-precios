import { NextResponse } from "next/server";
import type { Articulo } from "@/lib/types";
import type { ArticuloCatalogo } from "@/lib/domain-types";
import { listarCatalogoPaginado } from "@/server/pricing-repository";

const DEFAULT_MAX_RECORDS = 50;
const SERVER_MAX_RECORDS = 100;

function toArticuloCatalogo(articulo: Articulo): ArticuloCatalogo {
  const clasificaciones = [
    articulo.clasificacion1,
    articulo.clasificacion2,
    articulo.clasificacion3,
    articulo.clasificacion4,
    articulo.clasificacion5,
  ]
    .map((clasificacion) => clasificacion?.trim())
    .filter((clasificacion): clasificacion is string => Boolean(clasificacion));

  return {
    codigo: articulo.codigo,
    descripcion: articulo.descripcion,
    precioActual: articulo.precioLista,
    costoReposicion: articulo.costoPromedio,
    margenUtilidadMin: articulo.margenUtilidadMinPorcentaje == null
      ? undefined
      : articulo.margenUtilidadMinPorcentaje / 100,
    categoria: "",
    categoriaDescripcion: "",
    subcategoria: articulo.clasificacion2 ?? "",
    subcategoriaDescripcion: articulo.clasificacion2Descripcion ?? "",
    grupo: articulo.clasificacion1 ?? "",
    grupoDescripcion: articulo.clasificacion1Descripcion ?? "",
    marca: articulo.clasificacion3 ?? "",
    marcaDescripcion: articulo.clasificacion3Descripcion ?? "",
    marcaGrupoCompra: articulo.clasificacion5 ?? "",
    marcaGrupoCompraDescripcion: articulo.clasificacion5Descripcion ?? "",
    bdf: articulo.clasificacion4 ?? "",
    bdfDescripcion: articulo.clasificacion4Descripcion ?? "",
  };
}

function parseNonNegativeInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const compania = url.searchParams.get("compania")?.trim().toUpperCase() ?? "";
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
    const page = await listarCatalogoPaginado(compania, nivelPrecio, search, offset, maxRecords);
    return NextResponse.json({
      items: page.items.map(toArticuloCatalogo),
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
