import { apiBadRequest, apiServiceResult, parseJsonBody, withIdentidad } from "@/shared/api";
import { listarEjecuciones, crearEjecucion } from "@/features/ejecucion/services/ejecucion-service";
import type { EjecucionKey } from "@/lib/domain-types";

const tipos: EjecucionKey[] = ["EJECUCION_PRECIOS", "EJECUCION_MARGEN", "EJECUCION_DESCUENTO"];

export const GET = withIdentidad(async (req, identidad) => {
  const tipo = new URL(req.url).searchParams.get("tipo") as EjecucionKey | null;
  if (!tipo || !tipos.includes(tipo)) return apiBadRequest("Tipo de ejecución inválido.");
  return apiServiceResult(await listarEjecuciones(identidad, tipo));
});

export const POST = withIdentidad(async (req, identidad) => {
  const body = await parseJsonBody<Partial<{ tipo: EjecucionKey; parametros: Record<string, unknown>; spNombre: string; observaciones: string }>>(req);
  if (!body?.tipo || !tipos.includes(body.tipo) || !body.parametros || !body.spNombre) {
    return apiBadRequest("Datos de ejecución incompletos.");
  }
  return apiServiceResult(await crearEjecucion(identidad, {
    tipo: body.tipo,
    parametros: body.parametros,
    spNombre: body.spNombre,
    observaciones: body.observaciones ?? null,
  }));
});
