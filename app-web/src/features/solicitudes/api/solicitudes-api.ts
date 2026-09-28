import { GENERIC_NETWORK_ERROR, GENERIC_SERVER_ERROR, type ApiResult } from "@/shared/api/api-types";
import type { FilaResultado, ProcesoKey, Solicitud } from "@/lib/domain-types";
import type { GestionGlobalLista, NivelPrecio } from "@/lib/types";
import type {
  CancelacionInput,
  DecisionCancelacionInput,
  RechazoInput,
  SimularManualInput,
  SolicitudInput,
} from "../schemas/solicitud-schema";
import type { CatalogoSolicitud } from "../types";

async function request<T>(url: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      cache: "no-store",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const json = (await res.json()) as ApiResult<T>;
    if (typeof json.ok === "boolean") return json;
    return { ok: false, error: GENERIC_SERVER_ERROR };
  } catch {
    return { ok: false, error: GENERIC_NETWORK_ERROR };
  }
}

export function getCatalogoGestionGlobal() {
  return request<{ listas: GestionGlobalLista[]; niveles: NivelPrecio[] }>("/api/gestion-global/catalogo");
}

export function getMisSolicitudes(proceso?: ProcesoKey) {
  const query = proceso ? `?proceso=${proceso}` : "";
  return request<{ solicitudes: Solicitud[] }>(`/api/solicitudes${query}`);
}

export function enviarSolicitud(input: SolicitudInput) {
  return request<{ solicitud: Solicitud }>("/api/solicitudes", { method: "POST", body: input });
}

export function guardarBorrador(input: SolicitudInput) {
  return request<{ solicitud: Solicitud }>("/api/solicitudes/borradores", { method: "POST", body: input });
}

export function enviarBorrador(id: string) {
  return request<Record<string, never>>(`/api/solicitudes/${encodeURIComponent(id)}/enviar`, { method: "POST" });
}

export function solicitarCancelacion(id: string, input: CancelacionInput) {
  return request<Record<string, never>>(`/api/solicitudes/${encodeURIComponent(id)}/cancelacion`, {
    method: "POST",
    body: input,
  });
}

export function getCatalogoSolicitud(nivel?: string, incluirArticulos = false) {
  const query = new URLSearchParams();
  if (nivel) query.set("nivel", nivel);
  if (incluirArticulos) query.set("articulos", "1");
  return request<CatalogoSolicitud>(`/api/catalogo/solicitud?${query.toString()}`);
}

export function simularManual(input: SimularManualInput) {
  return request<{ filas: FilaResultado[] }>("/api/simulacion/manual", { method: "POST", body: input });
}

export async function parsearExcel(input: { proceso: ProcesoKey; nivelPrecio?: string; archivo: File }) {
  const formData = new FormData();
  formData.append("proceso", input.proceso);
  if (input.nivelPrecio) formData.append("nivelPrecio", input.nivelPrecio);
  formData.append("archivo", input.archivo);
  try {
    const res = await fetch("/api/excel/parseo", { method: "POST", body: formData });
    const json = (await res.json()) as ApiResult<{ filas: FilaResultado[]; archivoNombre?: string; archivoS3Key?: string }>;
    return typeof json.ok === "boolean" ? json : ({ ok: false, error: GENERIC_SERVER_ERROR } as const);
  } catch {
    return { ok: false, error: GENERIC_NETWORK_ERROR } as const;
  }
}

export function getBandeja(offset = 0, limit = 20) {
  const q = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  return request<{ solicitudes: Solicitud[]; total: number; hasMore: boolean; nextOffset: number | null }>(
    `/api/bandeja?${q.toString()}`,
  );
}

export function getSolicitudDetalle(id: string) {
  return request<{ solicitud: Solicitud }>(`/api/bandeja/${encodeURIComponent(id)}`);
}

export function registrarRevision(id: string) {
  return request<Record<string, never>>(`/api/solicitudes/${encodeURIComponent(id)}/revision`, { method: "POST" });
}

export function aprobarSolicitud(id: string) {
  return request<{ idProcesoSP?: string }>(`/api/solicitudes/${encodeURIComponent(id)}/aprobacion`, { method: "POST" });
}

export function reintentarSolicitud(id: string) {
  return request<{ idProcesoSP?: string }>(`/api/solicitudes/${encodeURIComponent(id)}/reintento`, { method: "POST" });
}

export function rechazarSolicitud(id: string, input: RechazoInput) {
  return request<Record<string, never>>(`/api/solicitudes/${encodeURIComponent(id)}/rechazo`, { method: "POST", body: input });
}

export function decidirCancelacion(id: string, input: DecisionCancelacionInput) {
  return request<Record<string, never>>(`/api/solicitudes/${encodeURIComponent(id)}/cancelacion/decision`, {
    method: "POST",
    body: input,
  });
}
