import { z } from "zod";

export const ROLE_CODES = ["operator", "approver", "auditor"] as const;

const AssignmentSchema = z.object({
  company: z.string().trim().min(1, { error: "La compañía es obligatoria" }),
  role: z.enum(ROLE_CODES, { error: "Rol inválido" }),
});

/** Un solo rol por compañía; un usuario no admin necesita al menos una asignación. */
const PermissionsSchema = z
  .object({
    isAdmin: z.boolean(),
    assignments: z.array(AssignmentSchema),
  })
  .refine((data) => new Set(data.assignments.map((a) => a.company)).size === data.assignments.length, {
    error: "Cada compañía admite un solo rol",
    path: ["assignments"],
  })
  .refine((data) => data.isAdmin || data.assignments.length > 0, {
    error: "Asigne al menos una compañía o marque al usuario como administrador",
    path: ["assignments"],
  });

export const CreateUserSchema = z
  .object({
    email: z.email({ error: "El correo electrónico no es válido" }),
    fullName: z.string().trim().min(1, { error: "El nombre es obligatorio" }),
  })
  .and(PermissionsSchema);

export const UpdateUserSchema = z
  .object({ fullName: z.string().trim().min(1, { error: "El nombre es obligatorio" }) })
  .and(PermissionsSchema);

export const ApproveUserSchema = PermissionsSchema;

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type ApproveUserInput = z.infer<typeof ApproveUserSchema>;
