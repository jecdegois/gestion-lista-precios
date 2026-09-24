import type { UserStatusDomain } from "@/lib/domain-types";
import type { UserView } from "../types";

export type UsersTab = "all" | "pending";

export const USER_STATUS: Record<UserStatusDomain, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "badge-pendiente" },
  active: { label: "Activo", className: "badge-aprobado" },
  inactive: { label: "Inactivo", className: "badge-rechazado" },
};

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export type UserFilters = { search: string; status: UserStatusDomain | "" };

/** Usuarios de la pestaña que coinciden con la búsqueda (nombre o correo) y el estado. */
export function filterUsers(users: UserView[], tab: UsersTab, filters: UserFilters) {
  const text = filters.search.trim().toLowerCase();
  return users.filter(
    (u) =>
      (tab === "pending" ? u.status === "pending" : !filters.status || u.status === filters.status) &&
      (!text || u.fullName.toLowerCase().includes(text) || u.email.toLowerCase().includes(text)),
  );
}
