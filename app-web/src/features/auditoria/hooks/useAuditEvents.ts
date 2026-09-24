"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/shared/components/layout/PortalProviders";
import type { EventoAuditoria } from "@/lib/domain-types";
import { getEventos } from "../api/auditoria-api";

/** Eventos de auditoría de la compañía en sesión. */
export function useAuditEvents() {
  const pushToast = useToast();
  const [events, setEvents] = useState<EventoAuditoria[]>([]);

  useEffect(() => {
    void getEventos().then((res) => {
      if (res.ok) setEvents(res.data.eventos);
      else pushToast(res.error, "error");
    });
  }, [pushToast]);

  return events;
}
