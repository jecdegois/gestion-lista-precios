"use client";

import { useState } from "react";
import type { RoleCode } from "@/shared/types/domain-types";
import Modal from "@/shared/components/ui/Modal";
import type { Assignment, Catalogs, UserView } from "../../types";
import AssignmentsFieldset, { type RolesByCompany } from "./AssignmentsFieldset";
import UserFields, { type BasicUserData } from "./UserFields";

export type UserModalMode = "create" | "edit" | "approve";

export type UserFormData = BasicUserData & { assignments: Assignment[] };

const COPY: Record<UserModalMode, { title: string; submit: string; note?: string }> = {
  create: {
    title: "Nuevo usuario",
    submit: "Crear usuario",
    note: "Se generará una contraseña temporal que se mostrará una sola vez; el usuario deberá cambiarla al ingresar.",
  },
  edit: {
    title: "Editar usuario",
    submit: "Guardar cambios",
    note: "Si cambian los permisos, se cerrarán las sesiones abiertas del usuario.",
  },
  approve: { title: "Aprobar solicitud de acceso", submit: "Aprobar" },
};

function toAssignments(roles: RolesByCompany): Assignment[] {
  return Object.entries(roles)
    .filter((entry): entry is [string, RoleCode] => entry[1] !== "")
    .map(([company, role]) => ({ company, role }));
}

/** Alta, edición y aprobación comparten el mismo formulario de datos y permisos por compañía. */
export default function UserModal({
  mode,
  user,
  catalogs,
  onClose,
  onSubmit,
}: {
  mode: UserModalMode;
  user?: UserView;
  catalogs: Catalogs;
  onClose: () => void;
  onSubmit: (data: UserFormData) => Promise<boolean>;
}) {
  const [data, setData] = useState<BasicUserData>({
    email: user?.email ?? "",
    fullName: user?.fullName ?? "",
    isAdmin: user?.isAdmin ?? false,
  });
  const [roles, setRoles] = useState<RolesByCompany>(() =>
    Object.fromEntries((user?.assignments ?? []).map((a) => [a.company, a.role])),
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const copy = COPY[mode];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const assignments = toAssignments(roles);
    if (!data.isAdmin && assignments.length === 0) {
      setError("Asigne al menos una compañía o marque al usuario como administrador");
      return;
    }
    setError("");
    setSubmitting(true);
    const ok = await onSubmit({ ...data, email: data.email.trim(), fullName: data.fullName.trim(), assignments });
    setSubmitting(false);
    if (ok) onClose();
  }

  return (
    <Modal
      title={copy.title}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-default" disabled={submitting}>
            {submitting ? "Guardando…" : copy.submit}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <UserFields data={data} emailEditable={mode === "create"} nameEditable={mode !== "approve"} onChange={setData} />
        <AssignmentsFieldset catalogs={catalogs} roles={roles} onChange={setRoles} />
        {copy.note && <p className="text-xs text-zinc-500">{copy.note}</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
