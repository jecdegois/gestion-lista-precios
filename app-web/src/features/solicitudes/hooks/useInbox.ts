"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/shared/components/layout/PortalProviders";
import type { Solicitud } from "@/lib/domain-types";
import type { ApiResult } from "@/shared/api/api-types";
import {
  aprobarSolicitud,
  decidirCancelacion,
  getBandeja,
  rechazarSolicitud,
  reintentarSolicitud,
  registrarRevision,
  solicitarCancelacion,
} from "../api/solicitudes-api";

const POLLING_MS = 2500;

/** Solicitudes de la bandeja, consulta periódica mientras haya procesos en curso y decisiones. */
export function useInbox(readOnly: boolean) {
  const pushToast = useToast();
  const [requests, setRequests] = useState<Solicitud[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const pollingInFlight = useRef(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await getBandeja();
      if (res.ok) setRequests(res.data.solicitudes);
      else pushToast(res.error, "error");
    } finally {
      setRefreshing(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Mientras haya solicitudes EN_PROCESO se consulta su estado periódicamente.
  const hasRunning = requests.some((s) => s.estado === "EN_PROCESO");
  useEffect(() => {
    if (!hasRunning) return;
    const interval = setInterval(async () => {
      if (pollingInFlight.current) return;
      pollingInFlight.current = true;
      try {
        await refresh();
      } finally {
        pollingInFlight.current = false;
      }
    }, POLLING_MS);
    return () => clearInterval(interval);
  }, [hasRunning, refresh]);

  /** Ejecuta una acción, notifica el resultado y refresca la bandeja. */
  async function run(action: () => Promise<ApiResult<unknown>>, success: string, variant: "success" | "error" = "success") {
    if (readOnly) return;
    const res = await action();
    if (!res.ok) pushToast(res.error, "error");
    else pushToast(success, variant);
    await refresh();
  }

  async function approve(id: string) {
    if (readOnly) return;
    const res = await aprobarSolicitud(id);
    if (!res.ok) pushToast(res.error, "error");
    else pushToast(`Solicitud ${id} en proceso · ${res.data.idProcesoSP ?? ""}`, "success");
    await refresh();
  }

  async function retry(id: string) {
    if (readOnly) return;
    const res = await reintentarSolicitud(id);
    if (!res.ok) pushToast(res.error, "error");
    else pushToast(`Solicitud ${id} reintentada y enviada a proceso.`, "success");
    await refresh();
  }

  async function markReviewed(id: string) {
    await registrarRevision(id);
    void refresh();
  }

  return {
    requests,
    refresh,
    refreshing,
    approve,
    retry,
    markReviewed,
    reject: (id: string, reason: string) =>
      run(() => rechazarSolicitud(id, { motivo: reason }), `Solicitud ${id} rechazada. El solicitante fue notificado.`, "error"),
    requestCancellation: (id: string, reason: string) =>
      run(() => solicitarCancelacion(id, { motivo: reason }), `Cancelación de ${id} solicitada. El aprobador debe confirmarla.`),
    decideCancellation: (id: string, approved: boolean) =>
      run(
        () => decidirCancelacion(id, { aprobada: approved }),
        approved ? `Solicitud ${id} cancelada.` : `Cancelación de ${id} denegada. Vuelve a PENDIENTE.`,
        approved ? "error" : "success",
      ),
  };
}
