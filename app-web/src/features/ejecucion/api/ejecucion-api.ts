import type { EjecucionKey, EjecucionLog, EstadoEjecucion } from "@/lib/domain-types";
import type { ApiResult } from "@/shared/api/api-types";

async function request<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    return (await response.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: "No fue posible conectar con el servidor." };
  }
}

export function crearEjecucion(input: { tipo: EjecucionKey; parametros: Record<string, unknown>; spNombre: string; observaciones: string }) {
  return request<{ ejecucion: EjecucionLog }>("/api/ejecuciones", { method: "POST", body: JSON.stringify(input) });
}

export function actualizarEjecucion(id: string, input: { estado: EstadoEjecucion; totalArticulos: number; exitosos: number; fallidos: number; observaciones: string }) {
  return request<{ ejecucion: EjecucionLog }>(`/api/ejecuciones/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function listarEjecuciones(tipo: EjecucionKey) {
  return request<{ ejecuciones: EjecucionLog[] }>(`/api/ejecuciones?tipo=${encodeURIComponent(tipo)}`);
}
