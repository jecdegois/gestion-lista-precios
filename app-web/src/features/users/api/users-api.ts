import { apiRequest } from "@/shared/api/api-request";
import type { ApproveUserInput, CreateUserInput, UpdateUserInput } from "../schemas/user-schema";
import type { UserListing, UserView } from "../types";

type WithUser = { user: UserView };

export function getUsers() {
  return apiRequest<UserListing>("/api/usuarios");
}

export function createUser(input: CreateUserInput) {
  return apiRequest<WithUser & { temporaryPassword: string }>("/api/usuarios", { method: "POST", body: input });
}

export function updateUser(id: string, input: UpdateUserInput) {
  return apiRequest<WithUser>(`/api/usuarios/${id}`, { method: "PATCH", body: input });
}

export function approveUser(id: string, input: ApproveUserInput) {
  return apiRequest<WithUser>(`/api/usuarios/${id}/aprobar`, { method: "POST", body: input });
}

export function deactivateUser(id: string) {
  return apiRequest<WithUser>(`/api/usuarios/${id}/desactivar`, { method: "POST" });
}

export function reactivateUser(id: string) {
  return apiRequest<WithUser>(`/api/usuarios/${id}/reactivar`, { method: "POST" });
}

export function resetUserPassword(id: string) {
  return apiRequest<{ temporaryPassword: string }>(`/api/usuarios/${id}/restablecer-password`, { method: "POST" });
}
