import { apiRequest } from "@/shared/api/api-request";
import { GENERIC_NETWORK_ERROR, GENERIC_SERVER_ERROR, type ApiResult } from "@/shared/api/api-types";
import type { FilaResultado, ProcesoKey, Solicitud } from "@/shared/types/domain-types";
import type { GestionGlobalLista, NivelPrecio } from "@/shared/types/models";
import type {
  CancelacionInput,
  DecisionCancelacionInput,
  RechazoInput,
  SimularManualInput,
  SolicitudInput,
} from "../schemas/solicitud-schema";
import type { CatalogoSolicitud } from "../types";

export function getCatalogoGestionGlobal() {
  return apiRequest<{ listas: GestionGlobalLista[]; niveles: NivelPrecio[] }>("/api/gestion-global/catalogo");
}

export function getMisSolicitudes(proceso?: ProcesoKey, offset = 0, limit = 20) {
  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (proceso) query.set("proceso", proceso);
  return apiRequest<{ solicitudes: Solicitud[]; total: number; hasMore: boolean; nextOffset: number | null }>(
    `/api/solicitudes?${query.toString()}`,
  );
}

export function enviarSolicitud(input: SolicitudInput) {
  return apiRequest<{ solicitud: Solicitud }>("/api/solicitudes", { method: "POST", body: input });
}

export function guardarBorrador(input: SolicitudInput) {
  return apiRequest<{ solicitud: Solicitud }>("/api/solicitudes/borradores", { method: "POST", body: input });
}

export function enviarBorrador(id: string) {
  return apiRequest<Record<string, never>>(`/api/solicitudes/${encodeURIComponent(id)}/enviar`, { method: "POST" });
}

export function solicitarCancelacion(id: string, input: CancelacionInput) {
  return apiRequest<Record<string, never>>(`/api/solicitudes/${encodeURIComponent(id)}/cancelacion`, {
    method: "POST",
    body: input,
  });
}

export function getCatalogoSolicitud(nivel?: string, incluirArticulos = false) {
  const query = new URLSearchParams();
  if (nivel) query.set("nivel", nivel);
  if (incluirArticulos) query.set("articulos", "1");
  return apiRequest<CatalogoSolicitud>(`/api/catalogo/solicitud?${query.toString()}`);
}

export function simularManual(input: SimularManualInput) {
  return apiRequest<{ filas: FilaResultado[] }>("/api/simulacion/manual", { method: "POST", body: input });
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
  return apiRequest<{ solicitudes: Solicitud[]; total: number; hasMore: boolean; nextOffset: number | null }>(
    `/api/bandeja?${q.toString()}`,
  );
}

export function getSolicitudDetalle(id: string) {
  return apiRequest<{ solicitud: Solicitud }>(`/api/bandeja/${encodeURIComponent(id)}`);
}

export function registrarRevision(id: string) {
  return apiRequest<Record<string, never>>(`/api/solicitudes/${encodeURIComponent(id)}/revision`, { method: "POST" });
}

export function aprobarSolicitud(id: string) {
  return apiRequest<{ idProcesoSP?: string }>(`/api/solicitudes/${encodeURIComponent(id)}/aprobacion`, { method: "POST" });
}

export function reintentarSolicitud(id: string) {
  return apiRequest<{ idProcesoSP?: string }>(`/api/solicitudes/${encodeURIComponent(id)}/reintento`, { method: "POST" });
}

export function rechazarSolicitud(id: string, input: RechazoInput) {
  return apiRequest<Record<string, never>>(`/api/solicitudes/${encodeURIComponent(id)}/rechazo`, { method: "POST", body: input });
}

export function decidirCancelacion(id: string, input: DecisionCancelacionInput) {
  return apiRequest<Record<string, never>>(`/api/solicitudes/${encodeURIComponent(id)}/cancelacion/decision`, {
    method: "POST",
    body: input,
  });
}
