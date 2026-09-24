import "server-only";
import type { CatalogoContext } from "@/lib/engine";
import type { ArticuloCatalogo } from "@/lib/domain-types";
import type { Articulo, NivelPrecio } from "@/lib/types";
import { pricingRepository } from "../repository/pricing-repository";

/** Contexto de catálogo (artículos, listas y grupos) que consume el motor de cálculo. */

function normalizarMargenUtilidadMinimo(porcentaje: number | null | undefined): number | undefined {
  if (porcentaje == null || !Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje >= 100) return undefined;
  return porcentaje / 100;
}

export function convertirArticuloMaestro(articulo: Articulo): ArticuloCatalogo {
  const clasificaciones = [
    articulo.clasificacion1,
    articulo.clasificacion2,
    articulo.clasificacion3,
    articulo.clasificacion4,
    articulo.clasificacion5,
  ]
    .map((clasificacion) => clasificacion?.trim())
    .filter((clasificacion): clasificacion is string => Boolean(clasificacion));
  const grupo = clasificaciones.length > 0 ? clasificaciones.join(" › ") : "Sin clasificación";

  return {
    codigo: articulo.codigo,
    descripcion: articulo.descripcion,
    precioActual: articulo.precioLista,
    costoReposicion: articulo.costoPromedio,
    margenUtilidadMin: normalizarMargenUtilidadMinimo(articulo.margenUtilidadMinPorcentaje),
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

export function crearContextoCatalogo(
  niveles: NivelPrecio[],
  articulosMaestros: Articulo[],
  listaBaseCodigo?: string,
): CatalogoContext {
  const articulos = articulosMaestros.map(convertirArticuloMaestro);
  const grupos: CatalogoContext["grupos"] = {};
  for (const articulo of articulos) {
    const clave = articulo.grupo || "Sin grupo";
    if (!grupos[clave]) grupos[clave] = { label: clave, articulos: [] };
    grupos[clave].articulos.push(articulo.codigo);
  }
  const nombresLista = Object.fromEntries(niveles.map((nivel) => [nivel.codigo, nivel.nombre]));
  const base = (listaBaseCodigo
    ? niveles.find((nivel) => nivel.codigo.toUpperCase() === listaBaseCodigo.toUpperCase())
    : undefined)
    ?? niveles.find((nivel) => nivel.codigo.toUpperCase() === "MAYOREOD")
    ?? niveles[0]
    ?? { codigo: "", nombre: "" };
  return {
    articulos: Object.fromEntries(articulos.map((articulo) => [articulo.codigo, articulo])),
    nombresLista,
    grupos,
    listaBase: { codigo: base.codigo, nombre: base.nombre, nivelPrecio: base.codigo },
  };
}

export async function cargarContextosPorLista(
  compania: string,
  niveles: NivelPrecio[],
  listas: string[],
): Promise<Map<string, CatalogoContext>> {
  const contextos = await Promise.all(
    listas.map(async (lista) => [
      lista,
      crearContextoCatalogo(niveles, await pricingRepository.listCatalog(compania, lista), lista),
    ] as const),
  );
  return new Map(contextos);
}

export function resolverNivelPrecio(niveles: NivelPrecio[], valor: string | null | undefined): string | undefined {
  const buscado = String(valor ?? "").trim().toLowerCase();
  if (!buscado) return undefined;
  return niveles.find((nivel) => nivel.codigo.trim().toLowerCase() === buscado)?.codigo;
}

export function nivelesSolicitadosCanonicos(niveles: NivelPrecio[], valores: (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(
      valores
        .map((valor) => resolverNivelPrecio(niveles, valor))
        .filter((valor): valor is string => Boolean(valor)),
    ),
  );
}
