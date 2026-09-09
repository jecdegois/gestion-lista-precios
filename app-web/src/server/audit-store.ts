import "server-only";
import type { EventoAuditoria } from "@/lib/types";

/**
 * Almacen de auditoria en memoria (proceso). Registra cada ejecucion con su
 * ID #PROC-YYYYMMDD-NNNN y el resumen en lenguaje de negocio. En produccion se
 * sustituye por una tabla de auditoria persistente por compania.
 */
const eventos: EventoAuditoria[] = [];
let secuencia = 0;

export function nuevoIdProceso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  secuencia += 1;
  const n = String(secuencia).padStart(4, "0");
  return `#PROC-${yyyy}${mm}${dd}-${n}`;
}

export function resumenNegocio(
  estadoFinal: EventoAuditoria["estadoFinal"],
  exitosos: number,
  fallidos: number,
): string {
  const total = exitosos + fallidos;
  if (estadoFinal === "PROCESADO") return `OK - Ejecutado completo (${exitosos} de ${total} registros)`;
  if (estadoFinal === "PROCESADO_CON_ERRORES")
    return `Completado con errores (${exitosos} exitosos, ${fallidos} con error de ${total})`;
  return `Error de ejecucion (0 de ${total} registros aplicados)`;
}

export function registrarEvento(evento: EventoAuditoria): void {
  eventos.unshift(evento);
}

export function listarEventos(compania?: string): EventoAuditoria[] {
  if (!compania) return [...eventos];
  const clave = compania.trim().toUpperCase();
  return eventos.filter((e) => e.compania.toUpperCase() === clave);
}
