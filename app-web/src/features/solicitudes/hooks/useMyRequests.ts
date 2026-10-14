"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { notify } from "@/shared/notifications/notify";
import type { FilaResultado, ProcesoKey, Solicitud } from "@/shared/types/domain-types";
import {
  enviarBorrador,
  getMisSolicitudes,
  getSolicitudCabecera,
  getSolicitudDetalle,
  getSolicitudDetallePaginado,
  getSolicitudHallazgosPaginado,
  solicitarCancelacion,
} from "../api/solicitudes-api";

const PAGE_SIZE = 20;
/** Tamaño de página para el detalle de filas (modal de revisión). */
const DETAIL_PAGE_SIZE = 50;

/**
 * Solicitudes propias del proceso, paginadas por cabecera (sin detalle de filas).
 * El detalle se carga de forma lazy al abrir el modal de una solicitud.
 * `?borrador=<id>` retoma un borrador una sola vez y luego limpia la URL.
 */
export function useMyRequests(process: ProcesoKey, readOnly: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const draftParam = useRef(useSearchParams().get("borrador"));

  const [requests, setRequests] = useState<Solicitud[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Solicitud abierta en el modal con detalle completo
  const [modalRequest, setModalRequest] = useState<Solicitud | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [draft, setDraft] = useState<Solicitud | undefined>();

  const refresh = useCallback(async () => {
    const res = await getMisSolicitudes(process, 0, PAGE_SIZE);
    if (!res.ok) {
      notify.error(res.error);
      return;
    }
    setRequests(res.data.solicitudes);
    setTotal(res.data.total);
    setHasMore(res.data.hasMore);
    setNextOffset(res.data.nextOffset);

    if (draftParam.current) {
      const requested = res.data.solicitudes.find(
        (s) => s.id === draftParam.current && s.estado === "BORRADOR",
      );
      draftParam.current = null;
      if (requested) {
        // Cargar el detalle del borrador para que el formulario tenga las filas
        const det = await getSolicitudDetalle(requested.id);
        setDraft(det.ok ? det.data.solicitud : requested);
      }
      router.replace(pathname);
    }
  }, [pathname, process, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Paginación incremental ─────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!hasMore || nextOffset == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getMisSolicitudes(process, nextOffset, PAGE_SIZE);
      if (res.ok) {
        setRequests((prev) => {
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
  }, [hasMore, nextOffset, loadingMore, process]);

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

  async function submitDraft(id: string) {
    if (readOnly) return;
    const res = await enviarBorrador(id);
    if (!res.ok) notify.error(res.error);
    else notify.success(`Solicitud ${id} enviada a aprobación.`);
    await refresh();
  }

  async function requestCancellation(id: string, reason: string) {
    if (readOnly) return;
    const res = await solicitarCancelacion(id, { motivo: reason });
    if (!res.ok) notify.error(res.error);
    else notify.success(`Cancelación de ${id} solicitada. El aprobador debe confirmarla.`);
    await refresh();
  }

  // Retomar borrador: carga el detalle completo para hidratar el formulario
  async function retomar(id: string) {
    const res = await getSolicitudDetalle(id);
    setDraft(res.ok ? res.data.solicitud : requests.find((s) => s.id === id));
  }

  return {
    requests,
    total,
    hasMore,
    nextOffset,
    loadingMore,
    draft,
    setDraft,
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
    retomar,
    submitDraft,
    requestCancellation,
  };
}
