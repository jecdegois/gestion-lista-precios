import type { Identidad, EjecucionKey, EstadoEjecucion } from "@/lib/domain-types";
import { ejecucionRepository } from "../repository/ejecucion-repository";

export async function crearEjecucion(identidad: Identidad, input: {
  tipo: EjecucionKey;
  parametros: Record<string, unknown>;
  spNombre: string;
  observaciones?: string | null;
}) {
  return { ok: true as const, ejecucion: await ejecucionRepository.crear(identidad.compania!, identidad.email, identidad.nombre, input) };
}

export async function actualizarEjecucion(identidad: Identidad, id: string, input: {
  estado: EstadoEjecucion;
  totalArticulos?: number | null;
  exitosos?: number | null;
  fallidos?: number | null;
  observaciones?: string | null;
}) {
  return { ok: true as const, ejecucion: await ejecucionRepository.actualizar(identidad.compania!, id, input) };
}

export async function listarEjecuciones(identidad: Identidad, tipo: EjecucionKey) {
  return { ok: true as const, ejecuciones: await ejecucionRepository.listar(identidad.compania!, tipo) };
}
