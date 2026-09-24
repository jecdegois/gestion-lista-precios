import type { UserView } from "../../types";

export type UserActionHandlers = {
  onApprove: (u: UserView) => void;
  onEdit: (u: UserView) => void;
  onDeactivate: (u: UserView) => void;
  onReactivate: (u: UserView) => void;
  onResetPassword: (u: UserView) => void;
};

/** Botones disponibles según el estado; las acciones destructivas piden confirmación. */
export default function UserActions({
  user: u,
  isCurrentUser,
  handlers,
}: {
  user: UserView;
  isCurrentUser: boolean;
  handlers: UserActionHandlers;
}) {
  const confirmThen = (question: string, action: (u: UserView) => void) => {
    if (window.confirm(question)) action(u);
  };

  return (
    <div className="flex justify-end gap-1 flex-wrap">
      {u.status === "pending" && (
        <>
          <button className="btn btn-default" onClick={() => handlers.onApprove(u)}>Aprobar</button>
          <button
            className="btn btn-outline"
            onClick={() => confirmThen(`¿Rechazar la solicitud de acceso de ${u.fullName}?`, handlers.onDeactivate)}
          >
            Rechazar
          </button>
        </>
      )}
      {u.status === "active" && (
        <>
          <button className="btn btn-outline" onClick={() => handlers.onEdit(u)}>Editar</button>
          {!isCurrentUser && (
            <>
              <button
                className="btn btn-outline"
                onClick={() =>
                  confirmThen(`¿Restablecer la contraseña de ${u.fullName}? Se cerrarán sus sesiones abiertas.`, handlers.onResetPassword)
                }
              >
                Restablecer contraseña
              </button>
              <button
                className="btn btn-ghost text-red-600"
                onClick={() => confirmThen(`¿Desactivar a ${u.fullName}? Se cerrarán sus sesiones abiertas.`, handlers.onDeactivate)}
              >
                Desactivar
              </button>
            </>
          )}
        </>
      )}
      {u.status === "inactive" && (
        <button className="btn btn-outline" onClick={() => handlers.onReactivate(u)}>Reactivar</button>
      )}
    </div>
  );
}
