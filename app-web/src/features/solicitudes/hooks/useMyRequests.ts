"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/shared/components/layout/PortalProviders";
import type { ProcesoKey, Solicitud } from "@/lib/domain-types";
import { enviarBorrador, getMisSolicitudes, solicitarCancelacion } from "../api/solicitudes-api";

/**
 * Solicitudes propias del proceso y borrador en edición. `?borrador=<id>` retoma
 * un borrador una sola vez (p. ej. desde la Bandeja) y luego se limpia de la URL.
 */
export function useMyRequests(process: ProcesoKey, readOnly: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const draftParam = useRef(useSearchParams().get("borrador"));
  const pushToast = useToast();
  const [requests, setRequests] = useState<Solicitud[]>([]);
  const [draft, setDraft] = useState<Solicitud | undefined>();

  const refresh = useCallback(async () => {
    const res = await getMisSolicitudes(process);
    if (!res.ok) {
      pushToast(res.error, "error");
      return;
    }
    setRequests(res.data.solicitudes);
    if (draftParam.current) {
      const requested = res.data.solicitudes.find((s) => s.id === draftParam.current && s.estado === "BORRADOR");
      draftParam.current = null;
      if (requested) setDraft(requested);
      router.replace(pathname);
    }
  }, [pathname, process, pushToast, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  return { requests, draft, setDraft, refresh, submitDraft, requestCancellation };
}
