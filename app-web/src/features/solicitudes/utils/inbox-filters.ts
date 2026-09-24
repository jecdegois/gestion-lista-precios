import { PROCESOS, estaEnAmbito } from "@/lib/catalog";
import type { EstadoSolicitud, Solicitud } from "@/lib/domain-types";

export const ALL = "TODOS";

export const INBOX_STATUSES: (EstadoSolicitud | typeof ALL)[] = [
  ALL,
  "PENDIENTE",
  "EN_PROCESO",
  "PROCESADO",
  "PROCESADO_CON_ERRORES",
  "RECHAZADO",
  "ERROR_EJECUCION",
];

export type InboxFilters = { status: string; process: string; search: string };

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Formatea un timestamp ISO o una cadena de fecha de BD a formato legible local. */
export function formatDbDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Orden por más reciente primero usando la fecha de creación cuando está disponible. */
export function byNewest(a: Solicitud, b: Solicitud) {
  const ts = (s: Solicitud) => {
    if (s.fechaCreacion) return new Date(s.fechaCreacion).getTime();
    if (s.fechaEnvio) return new Date(s.fechaEnvio).getTime();
    return 0;
  };
  return ts(b) - ts(a);
}

/** Solicitudes visibles en la bandeja: sin borradores, de la compañía y según filtros y búsqueda. */
export function filterInbox(requests: Solicitud[], company: string | null, filters: InboxFilters): Solicitud[] {
  const query = normalize(filters.search);
  return requests.filter((s) => {
    if (s.estado === "BORRADOR") return false;
    if (!estaEnAmbito(company, s.compania)) return false;
    if (filters.status !== ALL && s.estado !== filters.status) return false;
    if (filters.process !== ALL && s.proceso !== filters.process) return false;
    if (!query) return true;
    const haystack = [s.id, s.proceso, PROCESOS[s.proceso]?.label, s.lista, s.compania, s.solicitanteNombre, s.solicitanteEmail, s.estado]
      .filter(Boolean)
      .join(" ");
    return normalize(haystack).includes(query);
  });
}
