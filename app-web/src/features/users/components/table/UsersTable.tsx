import type { Catalogs, UserView } from "../../types";
import type { UsersTab } from "../../utils/user-format";
import type { UserActionHandlers } from "./UserActions";
import UserRow from "./UserRow";

export default function UsersTable({
  users,
  tab,
  roles,
  currentEmail,
  emptyMessage,
  handlers,
}: {
  users: UserView[];
  tab: UsersTab;
  roles: Catalogs["roles"];
  currentEmail: string;
  emptyMessage: string;
  handlers: UserActionHandlers;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-zinc-500 bg-zinc-50">
          <tr>
            <th className="px-4 py-2 font-medium">Usuario</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium">{tab === "pending" ? "Solicitado" : "Compañías y roles"}</th>
            {tab === "all" && <th className="px-4 py-2 font-medium">Último acceso</th>}
            <th className="px-4 py-2 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {users.map((u) => (
            <UserRow key={u.id} user={u} tab={tab} roles={roles} isCurrentUser={u.email === currentEmail} handlers={handlers} />
          ))}
          {!users.length && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-500">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
