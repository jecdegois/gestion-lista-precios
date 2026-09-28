"use client";

import type { Solicitud } from "@/lib/domain-types";
import { filterInbox, type InboxFilters } from "../utils/inbox-filters";

export { INBOX_PAGE_SIZE } from "./useInbox";

/**
 * Aplica los filtros UI (estado, proceso, búsqueda) sobre la lista de solicitudes
 * ya cargada del server. La paginación server-side la controla useInbox directamente,
 * por lo que este hook ya no tiene lógica de loadMore propio.
 */
export function useInboxRows(requests: Solicitud[], compania: string | null, filters: InboxFilters) {
  return filterInbox(requests, compania, filters);
}
