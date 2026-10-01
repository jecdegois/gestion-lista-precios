"use client";

import { useForm, type FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { RoleCode } from "@/shared/types/domain-types";
import Modal from "@/shared/components/ui/Modal";
import { UserFormSchema, type UserFormInput } from "../../schemas/user-schema";
import type { Assignment, Catalogs, UserView } from "../../types";
import AssignmentsFieldset from "./AssignmentsFieldset";
import UserFields from "./UserFields";

export type UserModalMode = "create" | "edit" | "approve";

export type UserFormData = Omit<UserFormInput, "roles"> & { assignments: Assignment[] };

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

function toAssignments(roles: UserFormInput["roles"]): Assignment[] {
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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserFormInput>({
    resolver: zodResolver(UserFormSchema),
    defaultValues: {
      email: user?.email ?? "",
      fullName: user?.fullName ?? "",
      isAdmin: user?.isAdmin ?? false,
      // Todas las compañías del catálogo con "" (sin acceso), más las asignaciones actuales.
      roles: {
        ...Object.fromEntries(catalogs.companies.map((c) => [c.code, ""])),
        ...Object.fromEntries((user?.assignments ?? []).map((a) => [a.company, a.role])),
      },
    },
  });
  const copy = COPY[mode];

  async function submit({ roles, ...data }: UserFormInput) {
    if (await onSubmit({ ...data, assignments: toAssignments(roles) })) onClose();
  }

  return (
    <Modal
      title={copy.title}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-default" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : copy.submit}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <UserFields register={register} errors={errors} emailEditable={mode === "create"} nameEditable={mode !== "approve"} />
        <AssignmentsFieldset catalogs={catalogs} register={register} error={(errors.roles as FieldError | undefined)?.message} />
        {copy.note && <p className="text-xs text-zinc-500">{copy.note}</p>}
      </div>
    </Modal>
  );
}
