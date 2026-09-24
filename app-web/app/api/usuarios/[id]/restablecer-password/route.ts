import { apiServiceResult, withAdmin } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { usersService } from "@/features/users/services/users-service";

/** Restablece la contraseña con una temporal de un solo uso. */
export const POST = withAdmin<{ params: { id: string } }>(async (req, session, { params }) =>
  apiServiceResult(await usersService.resetPassword(session, params.id, requestContext(req))),
);
