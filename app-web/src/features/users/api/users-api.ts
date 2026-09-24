import { GENERIC_NETWORK_ERROR, GENERIC_SERVER_ERROR, type ApiResult } from "@/shared/api/api-types";
import type { ApproveUserInput, CreateUserInput, UpdateUserInput } from "../schemas/user-schema";
import type { UserListing, UserView } from "../types";

async function request<T>(url: string, init?: { method?: "GET" | "POST" | "PATCH"; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      cache: "no-store",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const json = (await res.json()) as ApiResult<T>;
    if (typeof json.ok === "boolean") return json;
    return { ok: false, error: GENERIC_SERVER_ERROR };
  } catch {
    return { ok: false, error: GENERIC_NETWORK_ERROR };
  }
}

type WithUser = { user: UserView };

export function getUsers() {
  return request<UserListing>("/api/usuarios");
}

export function createUser(input: CreateUserInput) {
  return request<WithUser & { temporaryPassword: string }>("/api/usuarios", { method: "POST", body: input });
}

export function updateUser(id: string, input: UpdateUserInput) {
  return request<WithUser>(`/api/usuarios/${id}`, { method: "PATCH", body: input });
}

export function approveUser(id: string, input: ApproveUserInput) {
  return request<WithUser>(`/api/usuarios/${id}/aprobar`, { method: "POST", body: input });
}

export function deactivateUser(id: string) {
  return request<WithUser>(`/api/usuarios/${id}/desactivar`, { method: "POST" });
}

export function reactivateUser(id: string) {
  return request<WithUser>(`/api/usuarios/${id}/reactivar`, { method: "POST" });
}

export function resetUserPassword(id: string) {
  return request<{ temporaryPassword: string }>(`/api/usuarios/${id}/restablecer-password`, { method: "POST" });
}
