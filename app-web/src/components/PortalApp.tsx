"use client";

import { useCallback, useEffect, useState } from "react";
import LoginScreen from "./LoginScreen";
import Header, { Vista403, type NavKey } from "./Header";
import NuevaSolicitud from "./NuevaSolicitud";
import MisSolicitudes from "./MisSolicitudes";
import BandejaAprobacion from "./BandejaAprobacion";
import Auditoria from "./Auditoria";
import RevisionModal from "./RevisionModal";
import {
  obtenerSolicitudes,
  obtenerAuditoria,
  aprobarSolicitud,
  rechazarSolicitud,
  registrarRevision,
} from "@/app/actions";
import type { EventoAuditoria, Identidad, Solicitud } from "@/lib/domain-types";

interface Toast {
  id: number;
  message: string;
  variant?: "success" | "error";
}

export default function PortalApp({ demo, readOnly, portalOnly }: { demo: boolean; readOnly: boolean; portalOnly: boolean }) {
  const [user, setUser] = useState<Identidad | null>(null);
  const [nav, setNav] = useState<NavKey>("nueva");
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modalId, setModalId] = useState<string | null>(null);

  const esAprobador = user?.rol === "APROBADOR";

  const refrescarSolicitudes = useCallback(async () => {
    if (!user) return;
    setSolicitudes(await obtenerSolicitudes(user.compania ?? undefined));
  }, [user]);

  const refrescarAuditoria = useCallback(async () => {
    if (!user) return;
    setEventos(await obtenerAuditoria(user.compania ?? undefined));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setNav(user.rol === "APROBADOR" ? "bandeja" : "nueva");
    setModalId(null);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (nav === "auditoria") void refrescarAuditoria();
    else void refrescarSolicitudes();
  }, [user, nav, refrescarAuditoria, refrescarSolicitudes]);

  // La actualización periódica solo aplica a las pestañas que consultan solicitudes.
  useEffect(() => {
    if (!user || nav === "auditoria") return;
    const hayEnProceso = solicitudes.some((s) => s.estado === "EN_PROCESO");
    const interval = setInterval(() => void refrescarSolicitudes(), hayEnProceso ? 2500 : 8000);
    return () => clearInterval(interval);
  }, [user, nav, solicitudes, refrescarSolicitudes]);

  function pushToast(message: string, variant?: "success" | "error") {
    const id = Date.now() + Math.random();
    setToasts((t) => t.concat([{ id, message, variant }]));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }

  async function handleAbrir(id: string) {
    setModalId(id);
    if (user) {
      const s = solicitudes.find((x) => x.id === id);
      if (s && s.estado === "PENDIENTE" && esAprobador && !readOnly && s.solicitanteEmail !== user.email) {
        await registrarRevision(id, user.nombre, user.rol, user.compania ?? "");
        void refrescarSolicitudes();
      }
    }
  }

  async function handleRechazar(id: string, motivo: string) {
    if (!user || readOnly) return;
    const res = await rechazarSolicitud(id, motivo, user.nombre, user.rol);
    if (!res.ok) pushToast(res.error ?? "No fue posible rechazar.", "error");
    else pushToast(`Solicitud ${id} rechazada. El solicitante fue notificado.`, "error");
    await refrescarSolicitudes();
  }

  async function handleAprobar(id: string) {
    if (!user || readOnly) return;
    const res = await aprobarSolicitud({
      solicitudId: id,
      aprobadorNombre: user.nombre,
      aprobadorEmail: user.email,
      aprobadorRol: user.rol,
    });
    if (!res.ok) pushToast(res.error ?? "No fue posible aprobar.", "error");
    else pushToast(`Solicitud ${id} en proceso · ${res.idProcesoSP}`, "success");
    await refrescarSolicitudes();
  }

  if (!user) return <LoginScreen onLogin={setUser} demo={demo} />;
  if (user.rol === "SIN_PERMISO") return <Vista403 user={user} />;

  const solicitudModal = modalId ? solicitudes.find((s) => s.id === modalId) : undefined;

  return (
    <div className="min-h-screen">
      <Header user={user} onLogout={() => setUser(null)} onNav={setNav} activeNav={nav} />
      <main className="max-w-6xl mx-auto px-6 py-6">
        {demo && (
          <div className="mb-4 inline-block badge badge-outline" title="Sin conexión a SQL Server; catálogo en memoria">
            Modo demo (sin SQL Server)
          </div>
        )}

        {nav === "nueva" && (
          <>
            <h1 className="text-xl font-bold text-zinc-900 mb-4">Nueva solicitud de cambio de precio</h1>
            <NuevaSolicitud readOnly={readOnly} consultaOnly={portalOnly} currentUser={user} onEnviado={refrescarSolicitudes} onToast={pushToast} />
            <MisSolicitudes solicitudes={solicitudes} currentUser={user} onVerDetalle={handleAbrir} />
          </>
        )}

        {nav === "bandeja" && (
          <>
            <h1 className="text-xl font-bold text-zinc-900 mb-1">Bandeja de aprobación</h1>
            <p className="text-sm text-zinc-500 mb-4">Revise las solicitudes de su compañía y consulte su detalle.</p>
            <BandejaAprobacion solicitudes={solicitudes} currentUser={user} readOnly={readOnly || !esAprobador} onAbrir={handleAbrir} />
          </>
        )}

        {nav === "auditoria" && (
          <>
            <h1 className="text-xl font-bold text-zinc-900 mb-1">Auditoría y Logs</h1>
            <p className="text-sm text-zinc-500 mb-4">Trazabilidad de eventos del flujo maker-checker.</p>
            <Auditoria eventos={eventos} />
          </>
        )}
      </main>

      {solicitudModal && (
        <RevisionModal
          solicitud={solicitudModal}
          currentUser={user}
          readOnly={readOnly}
          onClose={() => setModalId(null)}
          onRechazar={handleRechazar}
          onAprobar={handleAprobar}
        />
      )}

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={"toast" + (t.variant ? " " + t.variant : "")}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
