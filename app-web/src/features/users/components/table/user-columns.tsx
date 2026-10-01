import type { TableColumn } from "@/shared/components/ui/ResponsiveDataTable";
import type { Catalogs, UserView } from "../../types";
import { formatDate, type UsersTab } from "../../utils/user-format";
import AssignmentBadges from "./AssignmentBadges";
import UserActions, { type UserActionHandlers } from "./UserActions";
import UserStatusBadge from "./UserStatusBadge";

export function userColumns({
  tab,
  roles,
  currentEmail,
  handlers,
}: {
  tab: UsersTab;
  roles: Catalogs["roles"];
  currentEmail: string;
  handlers: UserActionHandlers;
}): TableColumn<UserView>[] {
  const columns: (TableColumn<UserView> | false)[] = [
    {
      key: "user",
      header: "Usuario",
      headerClass: "w-[32%]",
      render: (u) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">
            {u.fullName}
            {u.isAdmin && <span className="ml-2 badge badge-enproceso">Admin</span>}
            {u.email === currentEmail && <span className="ml-2 text-xs text-zinc-400">(usted)</span>}
          </p>
          <p className="text-zinc-500 mono truncate" title={u.email}>{u.email}</p>
        </div>
      ),
    },
    { key: "status", header: "Estado", render: (u) => <UserStatusBadge user={u} /> },
    tab === "pending"
      ? { key: "createdAt", header: "Solicitado", cellClass: "text-zinc-600", value: (u) => formatDate(u.createdAt) }
      : {
          key: "assignments",
          header: "Compañías y roles",
          headerClass: "w-[28%]",
          render: (u) => <AssignmentBadges assignments={u.assignments} roles={roles} />,
        },
    tab === "all" && { key: "lastLogin", header: "Último acceso", cellClass: "text-zinc-600", value: (u) => formatDate(u.lastLoginAt) },
    {
      key: "actions",
      header: "Acciones",
      align: "right",
      render: (u) => <UserActions user={u} isCurrentUser={u.email === currentEmail} handlers={handlers} />,
    },
  ];
  return columns.filter((c): c is TableColumn<UserView> => !!c);
}
