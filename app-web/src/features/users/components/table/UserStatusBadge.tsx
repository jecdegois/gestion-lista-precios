import type { UserView } from "../../types";
import { USER_STATUS } from "../../utils/user-format";

export default function UserStatusBadge({ user }: { user: UserView }) {
  const status = USER_STATUS[user.status];
  return (
    <>
      <span className={"badge " + status.className}>{status.label}</span>
      {user.mustChangePassword && user.status === "active" && (
        <p className="text-[11px] text-zinc-500 mt-1">Debe cambiar contraseña</p>
      )}
    </>
  );
}
