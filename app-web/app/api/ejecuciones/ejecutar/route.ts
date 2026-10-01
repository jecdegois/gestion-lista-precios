import { apiBadRequest, apiServiceResult, parseJsonBody, withIdentidad } from "@/shared/api";
import { ejecutarSpPrecios } from "@/features/ejecucion/services/ejecucion-service";

/**
 * POST /api/ejecuciones/ejecutar
 * Cuerpo esperado: { nivelPrecio, version }. El resto de parametros se relee de
 * GESTION_LISTAS_PRECIOS en el servidor; no se confia en lo que mande el cliente.
 * Orquesta: crea log EN_PROCESO → ejecuta SP_GESTION_LISTAS_PRECIOS_FULL → actualiza log COMPLETADO | ERROR.
 */
export const POST = withIdentidad(async (req, identidad) => {
  const body = await parseJsonBody<{ nivelPrecio?: unknown; version?: unknown }>(req);
  const nivelPrecio = typeof body?.nivelPrecio === "string" ? body.nivelPrecio.trim() : "";
  const version = Number(body?.version);

  if (!nivelPrecio || !Number.isInteger(version)) {
    return apiBadRequest("Parametros de ejecucion incompletos.");
  }

  return apiServiceResult(await ejecutarSpPrecios(identidad, nivelPrecio, version));
});
