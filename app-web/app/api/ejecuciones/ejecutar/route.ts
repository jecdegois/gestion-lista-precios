import { apiBadRequest, apiServiceResult, parseJsonBody, withIdentidad } from "@/shared/api";
import { ejecutarSpPrecios } from "@/features/ejecucion/services/ejecucion-service";
import type { EjecucionSpPreciosInput } from "@/features/ejecucion/repository/ejecucion-repository";

/**
 * POST /api/ejecuciones/ejecutar
 * Cuerpo esperado: EjecucionSpPreciosInput
 * Orquesta: crea log EN_PROCESO → ejecuta SP_GESTION_LISTAS_PRECIOS_FULL → actualiza log COMPLETADO | ERROR.
 */
export const POST = withIdentidad(async (req, identidad) => {
  const body = await parseJsonBody<Partial<EjecucionSpPreciosInput>>(req);

  if (
    !body?.nivelPrecio        ||
    !body.fechaInicio         ||
    !body.fechaFin            ||
    !body.nivelPrecioBase     ||
    body.factorMultiplicador == null ||
    body.version == null
  ) {
    return apiBadRequest("Parametros de ejecucion incompletos.");
  }

  const input: EjecucionSpPreciosInput = {
    nivelPrecio:                body.nivelPrecio,
    moneda:                     body.moneda ?? null,
    fechaInicio:                body.fechaInicio,
    fechaFin:                   body.fechaFin,
    nivelPrecioBase:            body.nivelPrecioBase,
    monedaBase:                 body.monedaBase ?? null,
    factorMultiplicador:        body.factorMultiplicador,
    version:                    body.version,
    // El usuario solicitante se toma de la identidad del servidor, no del body
    usuarioSolicitante:         identidad.nombre,
    exigirFactorConfigurado:    body.exigirFactorConfigurado  ?? false,
    validarPrecioBajoCosto:     body.validarPrecioBajoCosto   ?? false,
    excepcionesArticulos:       body.excepcionesArticulos     ?? null,
    validarPrecioBajoMargenMin: body.validarPrecioBajoMargenMin ?? false,
  };

  return apiServiceResult(await ejecutarSpPrecios(identidad, input));
});
