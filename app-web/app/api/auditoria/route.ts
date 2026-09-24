import { apiServiceResult, withIdentidad } from "@/shared/api";
import { auditoriaService } from "@/features/auditoria/services/auditoria-service";

/** Eventos de auditoría de la compañía en sesion. */
export const GET = withIdentidad(async (_req, identidad) =>
  apiServiceResult(await auditoriaService.listarEventos(identidad)),
);
