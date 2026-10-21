import { apiServiceResult, withAdmin } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { usersService } from "@/features/users/services/users-service";

/** Restablece la contraseña con una temporal de un solo uso. */
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(async (req, session, { params }) =>
  apiServiceResult(await usersService.resetPassword(session, (await params).id, requestContext(req))),
);
