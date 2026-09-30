import { apiBadRequest, apiServiceResult, parseJsonBody, withAdmin } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { UpdateUserSchema } from "@/features/users/schemas/user-schema";
import { usersService } from "@/features/users/services/users-service";

/** Edita nombre, privilegio de administrador y asignaciones de un usuario. */
export const PATCH = withAdmin<{ params: { id: string } }>(async (req, session, { params }) => {
  const parsed = UpdateUserSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiBadRequest(parsed.error.issues[0]?.message ?? "Datos inválidos");

  return apiServiceResult(await usersService.update(session, params.id, parsed.data, requestContext(req)));
});
