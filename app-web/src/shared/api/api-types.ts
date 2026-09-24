export type ApiOk<T> = { ok: true; data: T; message?: string };
export type ApiErrorRes = { ok: false; error: string };
export type ApiResult<T> = ApiOk<T> | ApiErrorRes;

export const GENERIC_SERVER_ERROR = "Error interno del servidor";
export const GENERIC_NETWORK_ERROR = "No se pudo conectar con el servidor";
