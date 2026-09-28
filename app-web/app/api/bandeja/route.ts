import { apiServiceResult, withIdentidad } from "@/shared/api";
import { solicitudesService } from "@/features/solicitudes/services/solicitudes-service";

function parseNonNegativeInt(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** Solicitudes enviadas de la compañía (bandeja de aprobación), paginadas por cabecera. */
export const GET = withIdentidad(async (req, identidad) => {
  const url = new URL(req.url);
  const offset = parseNonNegativeInt(url.searchParams.get("offset"), 0);
  const limit = parseNonNegativeInt(url.searchParams.get("limit"), 20);
  return apiServiceResult(await solicitudesService.listarBandejaPaginada(identidad, offset, limit));
});
