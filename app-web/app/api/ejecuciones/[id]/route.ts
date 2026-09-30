import { apiBadRequest, apiServiceResult, parseJsonBody, withIdentidad } from "@/shared/api";
import { actualizarEjecucion } from "@/features/ejecucion/services/ejecucion-service";
import type { EstadoEjecucion } from "@/lib/domain-types";

const estados: EstadoEjecucion[] = ["PENDIENTE", "EN_PROCESO", "COMPLETADO", "COMPLETADO_CON_ERRORES", "ERROR"];

export const PATCH = withIdentidad<{ params: { id: string } }>(async (req, identidad, { params }) => {
  if (!/^\d+$/.test(params.id)) return apiBadRequest("Identificador de ejecución inválido.");
  const body = await parseJsonBody<Partial<{ estado: EstadoEjecucion; totalArticulos: number; exitosos: number; fallidos: number; observaciones: string }>>(req);
  if (!body?.estado || !estados.includes(body.estado)) return apiBadRequest("Estado de ejecución inválido.");
  return apiServiceResult(await actualizarEjecucion(identidad, params.id, {
    estado: body.estado,
    totalArticulos: body.totalArticulos,
    exitosos: body.exitosos,
    fallidos: body.fallidos,
    observaciones: body.observaciones,
  }));
});
