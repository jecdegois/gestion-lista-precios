"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/shared/components/layout/PortalProviders";
import type { Solicitud } from "@/lib/domain-types";
import type { ApiResult } from "@/shared/api/api-types";
import {
  aprobarSolicitud,
  decidirCancelacion,
  getBandeja,
  getSolicitudDetalle,
  rechazarSolicitud,
  reintentarSolicitud,
  registrarRevision,
  solicitarCancelacion,
} from "../api/solicitudes-api";

const POLLING_MS = 2500;
export const INBOX_PAGE_SIZE = 20;

/**
 * Bandeja paginada server-side (20 cabeceras por página).
 * El detalle de filas se carga de forma lazy al abrir el modal de cada solicitud.
 * El polling de EN_PROCESO refresca solo la primera página para no sobrecargar.
 */
export function useInbox(readOnly: boolean) {
  const pushToast = useToast();

  // Lista acumulada de solicitudes (cabeceras sin filas de detalle)
  const [requests, setRequests] = useState<Solicitud[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Solicitud abierta en el modal, con su detalle completo cargado
  const [modalRequest, setModalRequest] = useState<Solicitud | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const pollingInFlight = useRef(false);

  // ── Carga inicial (primera página) ────────────────────────────────────────
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await getBandeja(0, INBOX_PAGE_SIZE);
      if (res.ok) {
        setRequests(res.data.solicitudes);
        setTotal(res.data.total);
        setHasMore(res.data.hasMore);
        setNextOffset(res.data.nextOffset);
      } else {
        pushToast(res.error, "error");
      }
    } finally {
      setRefreshing(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Paginación incremental ─────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!hasMore || nextOffset == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getBandeja(nextOffset, INBOX_PAGE_SIZE);
      if (res.ok) {
        setRequests((prev) => {
          // Deduplicar por id (el polling puede haber actualizado cabeceras ya visibles)
          const ids = new Set(prev.map((s) => s.id));
          const nuevas = res.data.solicitudes.filter((s) => !ids.has(s.id));
          return [...prev, ...nuevas];
        });
        setTotal(res.data.total);
        setHasMore(res.data.hasMore);
        setNextOffset(res.data.nextOffset);
      } else {
        pushToast(res.error, "error");
      }
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextOffset, loadingMore, pushToast]);

  // ── Polling de EN_PROCESO: refresca solo la primera página ─────────────────
  const hasRunning = requests.some((s) => s.estado === "EN_PROCESO");
  useEffect(() => {
    if (!hasRunning) return;
    const interval = setInterval(async () => {
      if (pollingInFlight.current) return;
      pollingInFlight.current = true;
      try {
        const res = await getBandeja(0, INBOX_PAGE_SIZE);
        if (res.ok) {
          setRequests((prev) => {
            // Actualiza cabeceras ya visibles con los datos frescos;
            // no descarta las páginas ya cargadas más allá de la primera.
            const mapaFresco = new Map(res.data.solicitudes.map((s) => [s.id, s]));
            return prev.map((s) => mapaFresco.get(s.id) ?? s);
          });
          // Actualizar también el modal abierto si su solicitud cambió de estado
          setModalRequest((prev) => {
            if (!prev) return null;
            const mapaFresco = new Map(res.data.solicitudes.map((s) => [s.id, s]));
            const actualizada = mapaFresco.get(prev.id);
            // Solo sustituir cabecera — conservar las filas de detalle ya cargadas
            return actualizada ? { ...actualizada, filas: prev.filas } : prev;
          });
        }
      } finally {
        pollingInFlight.current = false;
      }
    }, POLLING_MS);
    return () => clearInterval(interval);
  }, [hasRunning]);

  // ── Detalle lazy al abrir el modal ────────────────────────────────────────
  async function openWithDetail(id: string): Promise<void> {
    // Mostrar cabecera inmediatamente mientras carga el detalle
    const cabecera = requests.find((s) => s.id === id) ?? null;
    setModalRequest(cabecera);
    setLoadingDetail(true);
    try {
      const res = await getSolicitudDetalle(id);
      if (res.ok) {
        setModalRequest(res.data.solicitud);
      } else {
        pushToast(res.error, "error");
      }
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeModal() {
    setModalRequest(null);
  }

  // ── Actualiza la cabecera en la lista después de una acción ───────────────
  async function refreshOne(id: string) {
    const res = await getSolicitudDetalle(id);
    if (!res.ok) return;
    const actualizada = res.data.solicitud;
    setRequests((prev) => prev.map((s) => (s.id === id ? { ...actualizada, filas: [] } : s)));
    // Si el modal sigue abierto para esta solicitud, actualizar también su detalle
    setModalRequest((prev) => (prev?.id === id ? actualizada : prev));
  }

  // ── Acción genérica: ejecuta, notifica, refresca la lista ─────────────────
  async function run(
    action: () => Promise<ApiResult<unknown>>,
    success: string,
    variant: "success" | "error" = "success",
  ) {
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
    void refreshOne(id);
  }

  return {
    requests,
    total,
    hasMore,
    nextOffset,
    refreshing,
    loadingMore,
    modalRequest,
    loadingDetail,
    refresh,
    loadMore,
    openWithDetail,
    closeModal,
    approve,
    retry,
    markReviewed,
    reject: (id: string, reason: string) =>
      run(
        () => rechazarSolicitud(id, { motivo: reason }),
        `Solicitud ${id} rechazada. El solicitante fue notificado.`,
        "error",
      ),
    requestCancellation: (id: string, reason: string) =>
      run(
        () => solicitarCancelacion(id, { motivo: reason }),
        `Cancelación de ${id} solicitada. El aprobador debe confirmarla.`,
      ),
    decideCancellation: (id: string, approved: boolean) =>
      run(
        () => decidirCancelacion(id, { aprobada: approved }),
        approved
          ? `Solicitud ${id} cancelada.`
          : `Cancelación de ${id} denegada. Vuelve a PENDIENTE.`,
        approved ? "error" : "success",
      ),
  };
}
