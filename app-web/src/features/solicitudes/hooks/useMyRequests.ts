"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/shared/components/layout/PortalProviders";
import type { ProcesoKey, Solicitud } from "@/lib/domain-types";
import { enviarBorrador, getMisSolicitudes, getSolicitudDetalle, solicitarCancelacion } from "../api/solicitudes-api";

const PAGE_SIZE = 20;

/**
 * Solicitudes propias del proceso, paginadas por cabecera (sin detalle de filas).
 * El detalle se carga de forma lazy al abrir el modal de una solicitud.
 * `?borrador=<id>` retoma un borrador una sola vez y luego limpia la URL.
 */
export function useMyRequests(process: ProcesoKey, readOnly: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const draftParam = useRef(useSearchParams().get("borrador"));
  const pushToast = useToast();

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
      pushToast(res.error, "error");
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
  }, [pathname, process, pushToast, router]);

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
        pushToast(res.error, "error");
      }
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, nextOffset, loadingMore, process, pushToast]);

  // ── Detalle lazy al abrir el modal ────────────────────────────────────────
  async function openWithDetail(id: string): Promise<void> {
    const cabecera = requests.find((s) => s.id === id) ?? null;
    setModalRequest(cabecera);
    setLoadingDetail(true);
    try {
      const res = await getSolicitudDetalle(id);
      if (res.ok) setModalRequest(res.data.solicitud);
      else pushToast(res.error, "error");
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeModal() {
    setModalRequest(null);
  }

  async function submitDraft(id: string) {
    if (readOnly) return;
    const res = await enviarBorrador(id);
    if (!res.ok) pushToast(res.error, "error");
    else pushToast(`Solicitud ${id} enviada a aprobación.`, "success");
    await refresh();
  }

  async function requestCancellation(id: string, reason: string) {
    if (readOnly) return;
    const res = await solicitarCancelacion(id, { motivo: reason });
    if (!res.ok) pushToast(res.error, "error");
    else pushToast(`Cancelación de ${id} solicitada. El aprobador debe confirmarla.`, "success");
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
    refresh,
    loadMore,
    openWithDetail,
    closeModal,
    retomar,
    submitDraft,
    requestCancellation,
  };
}
