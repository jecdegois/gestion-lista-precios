import { apiServiceResult, withAdmin } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { usersService } from "@/features/users/services/users-service";

/** Desactiva un usuario o rechaza una solicitud pendiente. */
export const POST = withAdmin<{ params: { id: string } }>(async (req, session, { params }) =>
  apiServiceResult(await usersService.deactivate(session, params.id, requestContext(req))),
);
