import {
  aprobarSolicitud,
  decidirCancelacion,
  enviarBorrador,
  enviarSolicitud,
  guardarBorrador,
  obtenerCatalogoSolicitud,
  obtenerSolicitudes,
  parsearExcel,
  rechazarSolicitud,
  registrarRevision,
  simularManual,
  solicitarCancelacion,
  type EnviarSolicitudInput,
} from "@/app/actions";
import { listarGestionGlobal, listarNivelesPrecio } from "@/server/pricing-repository";
import { obtenerSolicitud } from "@/server/portal-repository";
import { estaEnAmbito } from "@/lib/catalog";
import type { CriteriosArticulo, FilaResultado, Identidad, ParametrosSolicitud, ProcesoKey } from "@/lib/domain-types";
import type {
  CancelacionInput,
  DecisionCancelacionInput,
  RechazoInput,
  SimularManualInput,
  SolicitudInput,
} from "../schemas/solicitud-schema";

const SIN_COMPANIA = { ok: false as const, error: "La sesión no tiene una compañía asignada." };
const NO_ENCONTRADA = { ok: false as const, error: "Solicitud no encontrada." };
const SOLO_APROBADOR = { ok: false as const, error: "Solo un Aprobador puede realizar esta acción." };
const AUTOAPROBACION = { ok: false as const, error: "No puede decidir sobre su propia solicitud (segregación de funciones)." };

/**
 * Decisiones del aprobador: la solicitud debe ser de su compañía, debe tener
 * rol APROBADOR y (salvo en cancelaciones) no puede ser el solicitante.
 */
async function validarDecision(identidad: Identidad, solicitudId: string, permitirPropia = false) {
  const solicitud = await obtenerSolicitud(solicitudId);
  if (!solicitud || !estaEnAmbito(identidad.compania, solicitud.compania)) return { error: NO_ENCONTRADA };
  if (identidad.rol !== "APROBADOR") return { error: SOLO_APROBADOR };
  if (!permitirPropia && solicitud.solicitanteEmail === identidad.email) return { error: AUTOAPROBACION };
  return { solicitud };
}

/**
 * La identidad (email, nombre, rol, compañía) siempre llega desde la sesion del
 * servidor; nunca desde el body. Por ahora delega en la logica de negocio de
 * `src/app/actions.ts`.
 */
function aEnviarInput(identidad: Identidad, compania: string, input: SolicitudInput): EnviarSolicitudInput {
  return {
    proceso: input.proceso,
    modalidad: input.modalidad,
    usuarioEmail: identidad.email,
    usuarioNombre: identidad.nombre,
    usuarioRol: identidad.rol,
    compania,
    parametros: input.parametros as ParametrosSolicitud,
    filas: input.filas as unknown as FilaResultado[],
    archivoNombre: input.archivoNombre ?? null,
    archivoS3Key: input.archivoS3Key ?? null,
  };
}

export const solicitudesService = {
  async catalogoGestionGlobal(identidad: Identidad) {
    if (!identidad.compania) return SIN_COMPANIA;
    const [listas, niveles] = await Promise.all([
      listarGestionGlobal(identidad.compania),
      listarNivelesPrecio(identidad.compania),
    ]);
    return { ok: true as const, listas, niveles };
  },

  async catalogoSolicitud(identidad: Identidad, nivel: string | undefined, incluirArticulos: boolean) {
    if (!identidad.compania) return SIN_COMPANIA;
    return { ok: true as const, ...(await obtenerCatalogoSolicitud(identidad.compania, nivel, incluirArticulos)) };
  },

  async simularManual(identidad: Identidad, input: SimularManualInput) {
    if (!identidad.compania) return SIN_COMPANIA;
    const res = await simularManual({
      ...input,
      criteriosArticulo: input.criteriosArticulo as CriteriosArticulo | undefined,
      compania: identidad.compania,
    });
    return res.ok ? res : { ok: false, error: "La compañía, lista o artículo no coincide con los maestros de Softland." };
  },

  /** Parsea la plantilla Excel (previsualizacion; no toca la BD). */
  async parsearExcel(identidad: Identidad, formData: FormData) {
    if (!identidad.compania) return SIN_COMPANIA;
    formData.set("compania", identidad.compania);
    return parsearExcel(formData);
  },

  /** Bandeja: solicitudes enviadas (no borradores) de la compañía en sesion. */
  async listarBandeja(identidad: Identidad) {
    if (!identidad.compania) return SIN_COMPANIA;
    const solicitudes = (await obtenerSolicitudes(identidad.compania)).filter((s) => s.estado !== "BORRADOR");
    return { ok: true as const, solicitudes };
  },

  /** Deja traza de que el aprobador abrió una solicitud PENDIENTE ajena. */
  async registrarRevision(identidad: Identidad, solicitudId: string) {
    const { solicitud, error } = await validarDecision(identidad, solicitudId);
    if (error) return error;
    return registrarRevision(solicitud.id, identidad.nombre, identidad.rol, solicitud.compania);
  },

  async aprobar(identidad: Identidad, solicitudId: string) {
    const { error } = await validarDecision(identidad, solicitudId);
    if (error) return error;
    return aprobarSolicitud({
      solicitudId,
      aprobadorNombre: identidad.nombre,
      aprobadorEmail: identidad.email,
      aprobadorRol: identidad.rol,
    });
  },

  async rechazar(identidad: Identidad, solicitudId: string, input: RechazoInput) {
    const { error } = await validarDecision(identidad, solicitudId);
    if (error) return error;
    return rechazarSolicitud(solicitudId, input.motivo, identidad.nombre, identidad.rol);
  },

  async decidirCancelacion(identidad: Identidad, solicitudId: string, input: DecisionCancelacionInput) {
    const { error } = await validarDecision(identidad, solicitudId, true);
    if (error) return error;
    return decidirCancelacion(solicitudId, input.aprobada, identidad.email, identidad.nombre, identidad.rol);
  },

  async listarMias(identidad: Identidad, proceso?: ProcesoKey) {
    if (!identidad.compania) return SIN_COMPANIA;
    const solicitudes = (await obtenerSolicitudes(identidad.compania)).filter(
      (s) => s.solicitanteEmail === identidad.email && (!proceso || s.proceso === proceso),
    );
    return { ok: true as const, solicitudes };
  },

  async enviar(identidad: Identidad, input: SolicitudInput) {
    if (!identidad.compania) return SIN_COMPANIA;
    return enviarSolicitud(aEnviarInput(identidad, identidad.compania, input));
  },

  async guardarBorrador(identidad: Identidad, input: SolicitudInput) {
    if (!identidad.compania) return SIN_COMPANIA;
    return guardarBorrador(aEnviarInput(identidad, identidad.compania, input));
  },

  enviarBorrador(identidad: Identidad, solicitudId: string) {
    return enviarBorrador(solicitudId, identidad.email, identidad.nombre, identidad.rol);
  },

  solicitarCancelacion(identidad: Identidad, solicitudId: string, input: CancelacionInput) {
    return solicitarCancelacion(solicitudId, input.motivo, identidad.email, identidad.nombre, identidad.rol);
  },
};
