import { NextResponse } from "next/server";
import { ApiErrorRes, ApiOk, ApiResult, GENERIC_SERVER_ERROR } from "./api-types";

export type ServiceResult = { ok: boolean; error?: string; message?: string };

export function apiOk<T>(data: T, message?: string, status = 200): NextResponse<ApiOk<T>> {
  return NextResponse.json({ ok: true, data, message }, { status });
}

export function apiError(error: string, status = 400): NextResponse<ApiErrorRes> {
  return NextResponse.json({ ok: false, error }, { status });
}

export function apiBadRequest(error: string): NextResponse<ApiErrorRes> {
  return apiError(error, 400);
}

export function apiUnauthorized(error: string): NextResponse<ApiErrorRes> {
  return apiError(error, 401);
}

export function apiServerError(): NextResponse<ApiErrorRes> {
  return apiError(GENERIC_SERVER_ERROR, 500);
}

/**
 * Convierte el resultado de un service ({ ok, error?, message?, ...extras }) en
 * una respuesta HTTP. Los fallos de dominio (ok: false) responden 200 con el
 * error en el body; los codigos de transporte (400/401/500) quedan para input
 * invalido, sesion ausente o excepciones.
 */
export function apiServiceResult(result: ServiceResult): NextResponse<ApiResult<Record<string, unknown>>> {
  if (result.ok) {
    const { ok: _ok, error: _error, message, ...data } = result;
    return apiOk(data, message);
  }
  return apiError(result.error ?? GENERIC_SERVER_ERROR, 200);
}

/** Parsea el body JSON del request. Devuelve null si es invalido o no parseable. */
export async function parseJsonBody<T = unknown>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Envuelve un route handler: captura excepciones no manejadas, las loguea y
 * responde 500 generico. Evita repetir try/catch en cada route.
 */
export function withApiRoute<T extends Request>(
  handler: (req: T) => Promise<Response>,
): (req: T) => Promise<Response> {
  return async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      console.error("[api] error no manejado:", error);
      return apiServerError();
    }
  };
}
