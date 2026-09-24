"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { useCurrentUser } from "@/shared/components/layout/PortalProviders";
import { useUsers } from "../hooks/useUsers";
import type { UserView } from "../types";
import { filterUsers, type UserFilters, type UsersTab } from "../utils/user-format";
import TemporaryPasswordModal from "./modals/TemporaryPasswordModal";
import UserModal, { type UserFormData, type UserModalMode } from "./modals/UserModal";
import type { UserActionHandlers } from "./table/UserActions";
import UsersTable from "./table/UsersTable";
import UsersFilters from "./UsersFilters";
import UsersTabs from "./UsersTabs";

/** Página de gestión de usuarios: compone pestañas, filtros, tabla y modales sobre `useUsers`. */
export default function UsersView({ tab }: { tab: UsersTab }) {
  const currentUser = useCurrentUser();
  const users = useUsers();
  const [filters, setFilters] = useState<UserFilters>({ search: "", status: "" });
  const [modal, setModal] = useState<{ mode: UserModalMode; user?: UserView } | null>(null);

  const visible = filterUsers(users.users, tab, filters);
  const pendingCount = users.users.filter((u) => u.status === "pending").length;
  const emptyMessage = users.loading
    ? "Cargando usuarios…"
    : tab === "pending" && !filters.search.trim()
      ? "No hay solicitudes de acceso pendientes."
      : "No hay usuarios que coincidan con la búsqueda.";

  const handlers: UserActionHandlers = {
    onApprove: (user) => setModal({ mode: "approve", user }),
    onEdit: (user) => setModal({ mode: "edit", user }),
    onDeactivate: (user) => void users.deactivate(user),
    onReactivate: (user) => void users.reactivate(user),
    onResetPassword: (user) => void users.resetPassword(user),
  };

  function submit({ email, fullName, isAdmin, assignments }: UserFormData) {
    if (!modal?.user) return users.create({ email, fullName, isAdmin, assignments });
    if (modal.mode === "approve") return users.approve(modal.user.id, { isAdmin, assignments });
    return users.update(modal.user.id, { fullName, isAdmin, assignments });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <UsersTabs tab={tab} pendingCount={pendingCount} />
        <button className="btn btn-default" onClick={() => setModal({ mode: "create" })}>
          <Icon name="plus" className="w-4 h-4" /> Nuevo usuario
        </button>
      </div>

      <div className="card">
        <UsersFilters filters={filters} showStatus={tab === "all"} onChange={setFilters} />
        <UsersTable
          users={visible}
          tab={tab}
          roles={users.catalogs.roles}
          currentEmail={currentUser.email}
          emptyMessage={emptyMessage}
          handlers={handlers}
        />
      </div>

      {modal && (
        <UserModal
          key={modal.user?.id ?? "new"}
          mode={modal.mode}
          user={modal.user}
          catalogs={users.catalogs}
          onClose={() => setModal(null)}
          onSubmit={submit}
        />
      )}
      {users.temporaryPassword && (
        <TemporaryPasswordModal {...users.temporaryPassword} onClose={users.dismissTemporaryPassword} />
      )}
    </>
  );
}
