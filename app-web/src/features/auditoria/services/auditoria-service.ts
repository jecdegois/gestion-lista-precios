import { listarEventos } from "@/server/portal-repository";
import type { Identidad } from "@/lib/domain-types";

export const auditoriaService = {
  /** Eventos del flujo maker-checker de la compañía en sesion. */
  async listarEventos(identidad: Identidad) {
    if (!identidad.compania) return { ok: false as const, error: "La sesión no tiene una compañía asignada." };
    return { ok: true as const, eventos: await listarEventos(identidad.compania) };
  },
};
