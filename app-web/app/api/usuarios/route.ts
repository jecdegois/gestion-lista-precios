import { apiBadRequest, apiServiceResult, parseJsonBody, withAdmin } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { CreateUserSchema } from "@/features/users/schemas/user-schema";
import { usersService } from "@/features/users/services/users-service";

/** Usuarios con sus asignaciones, más los catálogos de compañías y roles. */
export const GET = withAdmin(async () => apiServiceResult(await usersService.list()));

/** Alta administrativa de un usuario con contraseña temporal. */
export const POST = withAdmin(async (req, session) => {
  const parsed = CreateUserSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) return apiBadRequest(parsed.error.issues[0]?.message ?? "Datos inválidos");

  return apiServiceResult(await usersService.create(session, parsed.data, requestContext(req)));
});
