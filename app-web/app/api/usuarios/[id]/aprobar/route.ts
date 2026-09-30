import { apiBadRequest, apiServiceResult, parseJsonBody, withAdmin } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { ApproveUserSchema } from "@/features/users/schemas/user-schema";
import { usersService } from "@/features/users/services/users-service";

/** Aprueba una solicitud de registro asignando compañías y roles. */
export const POST = withAdmin<{ params: { id: string } }>(async (req, session, { params }) => {
  const parsed = ApproveUserSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiBadRequest(parsed.error.issues[0]?.message ?? "Datos inválidos");

  return apiServiceResult(await usersService.approve(session, params.id, parsed.data, requestContext(req)));
});
