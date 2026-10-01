import { apiRequest } from "@/shared/api/api-request";
import type { EjecucionKey, EjecucionLog, EstadoEjecucion } from "@/shared/types/domain-types";

export function crearEjecucion(input: { tipo: EjecucionKey; parametros: Record<string, unknown>; spNombre: string; observaciones: string }) {
  return apiRequest<{ ejecucion: EjecucionLog }>("/api/ejecuciones", { method: "POST", body: input });
}

export function actualizarEjecucion(id: string, input: { estado: EstadoEjecucion; totalArticulos: number; exitosos: number; fallidos: number; observaciones: string }) {
  return apiRequest<{ ejecucion: EjecucionLog }>(`/api/ejecuciones/${encodeURIComponent(id)}`, { method: "PATCH", body: input });
}

export function listarEjecuciones(tipo: EjecucionKey) {
  return apiRequest<{ ejecuciones: EjecucionLog[] }>(`/api/ejecuciones?tipo=${encodeURIComponent(tipo)}`);
}

/** Ejecuta SP_GESTION_LISTAS_PRECIOS_FULL end-to-end (crea log, invoca SP, actualiza log). */
export function ejecutarPrecios(input: { nivelPrecio: string; version: number }) {
  return apiRequest<{ ejecucion: EjecucionLog }>("/api/ejecuciones/ejecutar", { method: "POST", body: input });
}
