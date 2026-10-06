"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { notify } from "@/shared/notifications/notify";
import type { FilaResultado, Solicitud } from "@/shared/types/domain-types";
import type { ApiResult } from "@/shared/api/api-types";
import {
  aprobarSolicitud,
  decidirCancelacion,
  getBandeja,
  getSolicitudCabecera,
  getSolicitudDetallePaginado,
  getSolicitudHallazgosPaginado,
  rechazarSolicitud,
  reintentarSolicitud,
  registrarRevision,
  solicitarCancelacion,
} from "../api/solicitudes-api";

const POLLING_MS = 2500;
export const INBOX_PAGE_SIZE = 20;
/** Tamaño de página para el detalle de filas (modal de revisión). */
export const DETAIL_PAGE_SIZE = 50;

/**
 * Bandeja paginada server-side (20 cabeceras por página).
 * El detalle de filas se carga de forma lazy al abrir el modal de cada solicitud.
 * El polling de EN_PROCESO refresca solo la primera página para no sobrecargar.
 */
export function useInbox(readOnly: boolean) {

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
        notify.error(res.error);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

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
        notify.error(res.error);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextOffset, loadingMore]);

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
  // Estado de paginación del detalle (para procesos no-GG)
  const [modalDetailFilas, setModalDetailFilas] = useState<FilaResultado[]>([]);
  const [modalDetailTotal, setModalDetailTotal] = useState(0);
  const [modalDetailTotalHallazgos, setModalDetailTotalHallazgos] = useState(0);
  const [modalDetailHasMore, setModalDetailHasMore] = useState(false);
  const [modalDetailNextOffset, setModalDetailNextOffset] = useState<number | null>(null);
  const [loadingDetailMore, setLoadingDetailMore] = useState(false);
  const detailOffsetsLoading = useRef(new Set<number>());

  // Estado de paginación de hallazgos (independiente del detalle)
  const [modalHallazgosFilas, setModalHallazgosFilas] = useState<FilaResultado[]>([]);
  const [modalHallazgosTotal, setModalHallazgosTotal] = useState(0);
  const [modalHallazgosHasMore, setModalHallazgosHasMore] = useState(false);
  const [modalHallazgosNextOffset, setModalHallazgosNextOffset] = useState<number | null>(null);
  const [loadingHallazgosMore, setLoadingHallazgosMore] = useState(false);
  const hallazgosOffsetsLoading = useRef(new Set<number>());

  /**
   * Abre el modal con la cabecera + primera página de filas.
   * Para Gestión Global (FACTOR_PRECIO) sigue el flujo existente (sin filas).
   */
  async function openWithDetail(id: string): Promise<void> {
    // Reset estado de detalle paginado
    setModalDetailFilas([]);
    setModalDetailTotal(0);
    setModalDetailTotalHallazgos(0);
    setModalDetailHasMore(false);
    setModalDetailNextOffset(null);
    detailOffsetsLoading.current.clear();

    // Reset estado de hallazgos paginados
    setModalHallazgosFilas([]);
    setModalHallazgosTotal(0);
    setModalHallazgosHasMore(false);
    setModalHallazgosNextOffset(null);
    hallazgosOffsetsLoading.current.clear();

    // Mostrar cabecera inmediatamente mientras carga el detalle
    const cabeceraLocal = requests.find((s) => s.id === id) ?? null;
    setModalRequest(cabeceraLocal);
    setLoadingDetail(true);

    try {
      // Cargar cabecera desde servidor (sin filas) para tener datos frescos
      const cabRes = await getSolicitudCabecera(id);
      if (!cabRes.ok) {
        notify.error(cabRes.error);
        return;
      }
      const cabecera = cabRes.data.solicitud;

      // Gestión Global (FACTOR_PRECIO) mantiene su flujo original — las filas vienen de Softland
      if (cabecera.proceso === "FACTOR_PRECIO") {
        setModalRequest(cabecera);
        return;
      }

      // Para otros procesos: cargar primera página de detalle y hallazgos en paralelo
      const [detRes, hallRes] = await Promise.all([
        getSolicitudDetallePaginado(id, 0, DETAIL_PAGE_SIZE),
        getSolicitudHallazgosPaginado(id, 0, DETAIL_PAGE_SIZE),
      ]);

      if (!detRes.ok) {
        // Mostrar cabecera aunque falle el detalle
        setModalRequest(cabecera);
        notify.error(detRes.error);
        return;
      }

      setModalDetailFilas(detRes.data.filas);
      setModalDetailTotal(detRes.data.total);
      setModalDetailTotalHallazgos(detRes.data.totalHallazgos);
      setModalDetailHasMore(detRes.data.hasMore);
      setModalDetailNextOffset(detRes.data.nextOffset);

      // Almacenar hallazgos paginados
      if (hallRes.ok) {
        setModalHallazgosFilas(hallRes.data.filas);
        setModalHallazgosTotal(hallRes.data.total);
        setModalHallazgosHasMore(hallRes.data.hasMore);
        setModalHallazgosNextOffset(hallRes.data.nextOffset);
      }

      // Combinar cabecera con primera página de filas
      setModalRequest({ ...cabecera, filas: detRes.data.filas });
    } finally {
      setLoadingDetail(false);
    }
  }

  /** Carga más filas del detalle (para procesos no-GG). */
  async function loadMoreDetail(): Promise<void> {
    if (!modalRequest || !modalDetailHasMore || modalDetailNextOffset == null) return;
    if (detailOffsetsLoading.current.has(modalDetailNextOffset)) return;

    const offset = modalDetailNextOffset;
    detailOffsetsLoading.current.add(offset);
    setLoadingDetailMore(true);

    try {
      const res = await getSolicitudDetallePaginado(modalRequest.id, offset, DETAIL_PAGE_SIZE);
      if (!res.ok) {
        notify.error(res.error);
        return;
      }

      const nuevasFilas = res.data.filas;
      setModalDetailFilas((prev) => [...prev, ...nuevasFilas]);
      setModalDetailTotal(res.data.total);
      setModalDetailHasMore(res.data.hasMore);
      setModalDetailNextOffset(res.data.nextOffset);

      // Actualizar también las filas en modalRequest
      setModalRequest((prev) =>
        prev ? { ...prev, filas: [...prev.filas, ...nuevasFilas] } : prev,
      );
    } finally {
      detailOffsetsLoading.current.delete(offset);
      setLoadingDetailMore(false);
    }
  }

  /** Carga más hallazgos (para procesos no-GG). */
  async function loadMoreHallazgos(): Promise<void> {
    if (!modalRequest || !modalHallazgosHasMore || modalHallazgosNextOffset == null) return;
    if (hallazgosOffsetsLoading.current.has(modalHallazgosNextOffset)) return;

    const offset = modalHallazgosNextOffset;
    hallazgosOffsetsLoading.current.add(offset);
    setLoadingHallazgosMore(true);

    try {
      const res = await getSolicitudHallazgosPaginado(modalRequest.id, offset, DETAIL_PAGE_SIZE);
      if (!res.ok) {
        notify.error(res.error);
        return;
      }

      setModalHallazgosFilas((prev) => [...prev, ...res.data.filas]);
      setModalHallazgosTotal(res.data.total);
      setModalHallazgosHasMore(res.data.hasMore);
      setModalHallazgosNextOffset(res.data.nextOffset);
    } finally {
      hallazgosOffsetsLoading.current.delete(offset);
      setLoadingHallazgosMore(false);
    }
  }

  function closeModal() {
    setModalRequest(null);
    setModalDetailFilas([]);
    setModalDetailTotal(0);
    setModalDetailTotalHallazgos(0);
    setModalDetailHasMore(false);
    setModalDetailNextOffset(null);
    detailOffsetsLoading.current.clear();
    // Limpiar estado de hallazgos
    setModalHallazgosFilas([]);
    setModalHallazgosTotal(0);
    setModalHallazgosHasMore(false);
    setModalHallazgosNextOffset(null);
    hallazgosOffsetsLoading.current.clear();
  }

  // ── Actualiza la cabecera en la lista después de una acción ───────────────
  async function refreshOne(id: string) {
    const res = await getSolicitudCabecera(id);
    if (!res.ok) return;
    const actualizada = res.data.solicitud;
    setRequests((prev) => prev.map((s) => (s.id === id ? { ...actualizada, filas: [] } : s)));
    // Si el modal sigue abierto para esta solicitud, actualizar cabecera conservando filas
    setModalRequest((prev) => (prev?.id === id ? { ...actualizada, filas: prev.filas } : prev));
  }

  // ── Acción genérica: ejecuta, notifica, refresca la lista ─────────────────
  async function run(
    action: () => Promise<ApiResult<unknown>>,
    success: string,
    variant: "success" | "error" = "success",
  ) {
    if (readOnly) return;
    const res = await action();
    if (!res.ok) notify.error(res.error);
    else notify.show(success, variant);
    await refresh();
  }

  async function approve(id: string) {
    if (readOnly) return;
    const res = await aprobarSolicitud(id);
    if (!res.ok) notify.error(res.error);
    else notify.success(`Solicitud ${id} en proceso · ${res.data.idProcesoSP ?? ""}`);
    await refresh();
  }

  async function retry(id: string) {
    if (readOnly) return;
    const res = await reintentarSolicitud(id);
    if (!res.ok) notify.error(res.error);
    else notify.success(`Solicitud ${id} reintentada y enviada a proceso.`);
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
    // Paginación del detalle (para procesos no-GG)
    modalDetailTotal,
    modalDetailTotalHallazgos,
    modalDetailHasMore,
    modalDetailNextOffset,
    loadingDetailMore,
    loadMoreDetail,
    // Paginación de hallazgos (independiente del detalle)
    modalHallazgosFilas,
    modalHallazgosTotal,
    modalHallazgosHasMore,
    modalHallazgosNextOffset,
    loadingHallazgosMore,
    loadMoreHallazgos,
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
