import { apiServiceResult, withAdmin } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { usersService } from "@/features/users/services/users-service";

/** Desactiva un usuario o rechaza una solicitud pendiente. */
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(async (req, session, { params }) =>
  apiServiceResult(await usersService.deactivate(session, (await params).id, requestContext(req))),
);
