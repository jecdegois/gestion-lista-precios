import type { Identidad } from "@/shared/types/domain-types";

/** Quién puede ver y operar Ejecución. TODO: sumar el rol EJECUTOR cuando el cliente lo defina. */
export const puedeEjecutar = (u: Pick<Identidad, "rol" | "isAdmin">) => u.rol === "APROBADOR" || !!u.isAdmin;
