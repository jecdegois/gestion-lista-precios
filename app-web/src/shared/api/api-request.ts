import { GENERIC_NETWORK_ERROR, GENERIC_SERVER_ERROR, type ApiResult } from "./api-types";

type RequestOptions = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown };

/**
 * Llamada del cliente a las APIs del portal: serializa el body como JSON (salvo FormData) y normaliza
 * cualquier respuesta inesperada o fallo de red a `{ ok: false, error }`.
 */
export async function apiRequest<T>(url: string, init: RequestOptions = {}): Promise<ApiResult<T>> {
  const isForm = init.body instanceof FormData;
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      cache: "no-store",
      // FormData (archivos) va tal cual: el navegador pone el Content-Type multipart con su boundary.
      headers: init.body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
      body: init.body instanceof FormData ? init.body : init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const json = (await res.json()) as ApiResult<T>;
    if (typeof json.ok === "boolean") return json;
    return { ok: false, error: GENERIC_SERVER_ERROR };
  } catch {
    return { ok: false, error: GENERIC_NETWORK_ERROR };
  }
}
