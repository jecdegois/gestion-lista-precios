import type { Catalogs, UserView } from "../../types";
import { formatDate, type UsersTab } from "../../utils/user-format";
import AssignmentBadges from "./AssignmentBadges";
import UserActions, { type UserActionHandlers } from "./UserActions";
import UserStatusBadge from "./UserStatusBadge";

export default function UserRow({
  user: u,
  tab,
  roles,
  isCurrentUser,
  handlers,
}: {
  user: UserView;
  tab: UsersTab;
  roles: Catalogs["roles"];
  isCurrentUser: boolean;
  handlers: UserActionHandlers;
}) {
  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-medium text-zinc-900">
          {u.fullName}
          {u.isAdmin && <span className="ml-2 badge badge-enproceso">Admin</span>}
          {isCurrentUser && <span className="ml-2 text-xs text-zinc-400">(usted)</span>}
        </p>
        <p className="text-xs text-zinc-500 mono">{u.email}</p>
      </td>
      <td className="px-4 py-3">
        <UserStatusBadge user={u} />
      </td>
      <td className="px-4 py-3 text-xs text-zinc-600">
        {tab === "pending" ? formatDate(u.createdAt) : <AssignmentBadges assignments={u.assignments} roles={roles} />}
      </td>
      {tab === "all" && <td className="px-4 py-3 text-xs text-zinc-600">{formatDate(u.lastLoginAt)}</td>}
      <td className="px-4 py-3">
        <UserActions user={u} isCurrentUser={isCurrentUser} handlers={handlers} />
      </td>
    </tr>
  );
}
