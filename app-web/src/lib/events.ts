import type { EstadoSolicitud, EventoTipo } from "./domain-types";

export const EVENTOS_AUDITORIA: Record<EventoTipo, string> = {
  SOLICITUD_ENVIADA: "Solicitud enviada a aprobación",
  SOLICITUD_RECHAZADA: "Solicitud rechazada",
  SIMULACION_REVISADA: "Simulación revisada por el aprobador",
  SIMULACION_EJECUTADA_COMO_SOLICITANTE: "Simulación verificada con los parámetros del solicitante",
  EJECUCION_ENCOLADA: "Ejecución autorizada y encolada",
  EJECUCION_FINALIZADA: "Procesamiento en segundo plano finalizado",
};

export function etiquetaEvento(evento: string): string {
  return (EVENTOS_AUDITORIA as Record<string, string>)[evento] ?? evento;
}

export function textoResultadoAuditoria(
  estadoFinal: EstadoSolicitud,
  exitosos: number,
  fallidos: number,
): string {
  const total = exitosos + fallidos;
  if (estadoFinal === "PROCESADO") return `OK · Ejecutado completo (${exitosos} de ${total} registros)`;
  if (estadoFinal === "PROCESADO_CON_ERRORES") return `Completado con errores (${exitosos} exitosos, ${fallidos} con error de ${total})`;
  return `Error de ejecución (0 de ${total} registros aplicados)`;
}
