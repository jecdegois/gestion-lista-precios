import "server-only";
import type { EventoAuditoria, EventoTipo, Rol, Solicitud } from "@/lib/domain-types";
import { construirFilaCompleta, construirFilaDescuentoMasivo, construirFilasMayoreodMasivo } from "@/lib/engine";

/**
 * Almacen en memoria de solicitudes y eventos (flujo maker-checker).
 * Reemplaza el estado React del mockup por un estado del lado servidor,
 * compartido por todas las sesiones del proceso. En produccion se sustituye
 * por tablas persistentes de solicitudes y auditoria por compania.
 *
 * REGLA DE ORO: las solicitudes en PENDIENTE/borrador NO tocan la base de
 * datos productiva; el SP real solo se dispara al aprobar (ver actions).
 */

function seedSolicitudes(): Solicitud[] {
  const filasAprobadas = [
    { fila: 1, codigo: "ART-231", tipoVariacion: "AUMENTO" as const, valorPropuestoRaw: "1.10", variacionPorcentaje: 10 },
    { fila: 2, codigo: "ART-455", tipoVariacion: "AUMENTO" as const, valorPropuestoRaw: "1.10", variacionPorcentaje: 10 },
  ].map((r) => construirFilaCompleta(r, "factor"));

  const filasMayoreod = construirFilasMayoreodMasivo("linea_blanca", "AUMENTO", 10);

  const filasDescuentoMasivo = [
    { fila: 1, listaCodigo: "mayoreob", codigo: "ART-231", tipoVariacion: "AUMENTO" as const, variacionPorcentaje: 10 },
    { fila: 2, listaCodigo: "lpv1", codigo: "ART-455", tipoVariacion: "DISMINUCION" as const, variacionPorcentaje: 5 },
  ].map((r) => construirFilaDescuentoMasivo(r));

  return [
    {
      id: "SOL-10449",
      proceso: "FACTOR_PRECIO",
      modalidad: "manual",
      compania: "SILLACA",
      lista: "",
      solicitanteNombre: "Juan Pérez",
      solicitanteEmail: "jperez@sillaca.com",
      parametros: { factor: "10", multiplicador: 1.1 },
      filas: filasAprobadas,
      archivoNombre: null,
      archivoS3Key: null,
      fechaEnvio: "2026-08-13 11:30",
      estado: "PROCESADO",
      motivoRechazo: null,
      idProcesoSP: "#PROC-20260813-2210",
      autorizadoPor: "María Rodríguez",
      autorizadoPorEmail: "mrodriguez@sillaca.com",
      resultado: {
        totalLote: 2,
        exitosos: 2,
        fallidos: 0,
        filas: filasAprobadas,
        estadoFinal: "PROCESADO",
        logS3Key: "erp-precios-logs/log-auditoria-SOL-10449.csv",
        aprobadoPor: "María Rodríguez",
        aprobadoPorEmail: "mrodriguez@sillaca.com",
      },
    },
    {
      id: "SOL-10448",
      proceso: "MAYOREOD_MASIVO",
      modalidad: "manual",
      compania: "SILLACA",
      lista: "MAYOREOD",
      solicitanteNombre: "Juan Pérez",
      solicitanteEmail: "jperez@sillaca.com",
      parametros: { listaBase: "MAYOREOD", nivelPrecio: "MayoreoD", grupoArticulos: "linea_blanca", factor: "10", multiplicador: 1.1, variacionPorcentaje: 10 },
      filas: filasMayoreod,
      archivoNombre: null,
      archivoS3Key: null,
      fechaEnvio: "2026-08-13 09:05",
      estado: "PENDIENTE",
      motivoRechazo: null,
      idProcesoSP: null,
    },
    {
      id: "SOL-10447",
      proceso: "DESCUENTO_LISTA_PRECIO",
      modalidad: "excel",
      compania: "SILLACA",
      lista: "",
      solicitanteNombre: "Juan Pérez",
      solicitanteEmail: "jperez@sillaca.com",
      parametros: { articulos: filasDescuentoMasivo },
      filas: filasDescuentoMasivo,
      archivoNombre: "descuento-articulos-masivo.xlsx",
      archivoS3Key: "erp-precios-uploads/descuento-articulos-masivo.xlsx",
      fechaEnvio: "2026-08-12 15:10",
      estado: "RECHAZADO",
      motivoRechazo: "El factor genera márgenes por debajo del costo en artículos de alto valor; corregir antes de reenviar.",
      idProcesoSP: null,
    },
  ];
}

// Estado global del proceso (persistente entre requests en el mismo server).
interface Store {
  solicitudes: Solicitud[];
  eventos: EventoAuditoria[];
  seq: number;
}

const globalRef = globalThis as unknown as { __mv26020Store?: Store };

function getStore(): Store {
  if (!globalRef.__mv26020Store) {
    globalRef.__mv26020Store = { solicitudes: seedSolicitudes(), eventos: [], seq: 1 };
  }
  return globalRef.__mv26020Store;
}

export function listarSolicitudes(): Solicitud[] {
  return getStore().solicitudes;
}

export function obtenerSolicitud(id: string): Solicitud | undefined {
  return getStore().solicitudes.find((s) => s.id === id);
}

export function agregarSolicitud(s: Solicitud): void {
  getStore().solicitudes.unshift(s);
}

export function actualizarSolicitud(id: string, patch: Partial<Solicitud>): Solicitud | undefined {
  const store = getStore();
  const idx = store.solicitudes.findIndex((s) => s.id === id);
  if (idx === -1) return undefined;
  store.solicitudes[idx] = { ...store.solicitudes[idx], ...patch };
  return store.solicitudes[idx];
}

export function siguienteSeq(): number {
  const store = getStore();
  const actual = store.seq;
  store.seq += 1;
  return actual;
}

export function registrarEvento(
  evento: EventoTipo,
  usuario: string,
  rol: Rol,
  compania: string,
  solicitudId: string | null,
  idProcesoSP: string | null,
): void {
  const store = getStore();
  store.eventos.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fecha: new Date().toLocaleString("es-CR", { hour12: false }),
    usuario,
    rol,
    evento,
    solicitudId,
    idProcesoSP,
    compania,
  });
}

export function listarEventos(compania?: string): EventoAuditoria[] {
  const eventos = getStore().eventos;
  if (!compania) return [...eventos];
  const clave = compania.toUpperCase();
  return eventos.filter((e) => e.compania.toUpperCase() === clave);
}
