import { apiServiceResult, withAdmin } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { usersService } from "@/features/users/services/users-service";

/** Reactiva un usuario inactivo. */
export const POST = withAdmin<{ params: { id: string } }>(async (req, session, { params }) =>
  apiServiceResult(await usersService.reactivate(session, params.id, requestContext(req))),
);
