"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  solicitarCancelacion,
  decidirCancelacion,
  enviarBorrador,
} from "@/app/actions";
import type { EventoAuditoria, Identidad, ProcesoKey, Solicitud } from "@/lib/domain-types";

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
  const [tipoSolicitudSeleccionado, setTipoSolicitudSeleccionado] = useState<ProcesoKey>("FACTOR_PRECIO");
  const pollingEnCurso = useRef(false);

  const esAprobador = user?.rol === "APROBADOR";
  const esAuditor = user?.rol === "AUDITOR";
  const [borradorActivo, setBorradorActivo] = useState<import("@/lib/domain-types").Solicitud | undefined>(undefined);

  const refrescarSolicitudes = useCallback(async () => {
    if (!user) return;
    try {
      const resultado = await obtenerSolicitudes(user.compania ?? undefined);
      setSolicitudes(Array.isArray(resultado) ? resultado : []);
    } catch (error) {
      console.error("No fue posible cargar las solicitudes del Portal.", error);
    }
  }, [user]);

  const refrescarAuditoria = useCallback(async () => {
    if (!user) return;
    setEventos(await obtenerAuditoria(user.compania ?? undefined));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (user.rol === "APROBADOR") setNav("bandeja");
    else if (user.rol === "AUDITOR") setNav("auditoria");
    else setNav("nueva");
    setModalId(null);
    setBorradorActivo(undefined);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const navEsperada = user.rol === "APROBADOR" ? "bandeja" : user.rol === "AUDITOR" ? "auditoria" : "nueva";
    if (nav !== navEsperada) return;
    if (nav === "auditoria") void refrescarAuditoria();
    else void refrescarSolicitudes();
  }, [user, nav, refrescarAuditoria, refrescarSolicitudes]);

  // La actualización periódica solo aplica a las pestañas que consultan solicitudes.
  const haySolicitudEnProceso = solicitudes.some((s) => s.estado === "EN_PROCESO");

  useEffect(() => {
    if (!user || nav !== "bandeja" || !haySolicitudEnProceso) return;
    const consultarEstado = async () => {
      if (pollingEnCurso.current) return;
      pollingEnCurso.current = true;
      try {
        await refrescarSolicitudes();
      } finally {
        pollingEnCurso.current = false;
      }
    };
    const interval = setInterval(() => void consultarEstado(), 2500);
    return () => clearInterval(interval);
  }, [user, nav, haySolicitudEnProceso, refrescarSolicitudes]);

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

  async function handleRetomar(id: string) {
    const s = solicitudes.find((x) => x.id === id);
    if (!s) return;
    setBorradorActivo(s);
    setNav("nueva");
    // scroll suave al top para que el formulario sea visible
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleEnviarBorrador(id: string) {
    if (!user || readOnly) return;
    const res = await enviarBorrador(id, user.email, user.nombre, user.rol);
    if (!res.ok) pushToast(res.error ?? "No fue posible enviar el borrador.", "error");
    else pushToast(`Solicitud ${id} enviada a aprobación.`, "success");
    await refrescarSolicitudes();
  }

  async function handleCancelar(id: string, motivo: string) {
    if (!user || readOnly) return;
    const res = await solicitarCancelacion(id, motivo, user.email, user.nombre, user.rol);
    if (!res.ok) pushToast(res.error ?? "No fue posible solicitar la cancelación.", "error");
    else pushToast(`Cancelación de ${id} solicitada. El aprobador debe confirmarla.`, "success");
    await refrescarSolicitudes();
  }

  async function handleDecidirCancelacion(id: string, aprobada: boolean) {
    if (!user || readOnly) return;
    const res = await decidirCancelacion(id, aprobada, user.email, user.nombre, user.rol);
    if (!res.ok) pushToast(res.error ?? "No fue posible procesar la cancelación.", "error");
    else pushToast(aprobada ? `Solicitud ${id} cancelada.` : `Cancelación de ${id} denegada. Vuelve a PENDIENTE.`, aprobada ? "error" : "success");
    await refrescarSolicitudes();
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
            <NuevaSolicitud
              key={borradorActivo?.id ?? "nueva"}
              readOnly={readOnly}
              consultaOnly={portalOnly}
              currentUser={user}
              borrador={borradorActivo}
              onEnviado={() => { setBorradorActivo(undefined); refrescarSolicitudes(); }}
              onTipoSolicitudChange={setTipoSolicitudSeleccionado}
              onToast={pushToast}
            />
            <MisSolicitudes solicitudes={solicitudes} currentUser={user} procesoFiltro={tipoSolicitudSeleccionado} onVerDetalle={handleAbrir} onCancelar={esAuditor ? undefined : handleCancelar} onEnviarBorrador={esAuditor ? undefined : handleEnviarBorrador} onRetomar={esAuditor ? undefined : handleRetomar} />
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
          onCancelar={handleCancelar}
          onDecidirCancelacion={handleDecidirCancelacion}
          onRetomar={esAuditor ? undefined : handleRetomar}
          onEnviarBorrador={esAuditor ? undefined : handleEnviarBorrador}
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
