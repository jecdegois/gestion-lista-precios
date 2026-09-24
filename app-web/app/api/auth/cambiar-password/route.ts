import { NextRequest } from "next/server";
import {
  apiBadRequest,
  apiServiceResult,
  apiUnauthorized,
  parseJsonBody,
  withApiRoute,
} from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { ChangePasswordSchema } from "@/features/auth/schemas/auth-schema";
import { authService } from "@/features/auth/services/auth-service";
import { SESSION_COOKIE_NAME } from "@/features/auth/session-cookie";

const INVALID_INPUT = "Datos inválidos";

/** Cambio de contrasena del usuario con sesion activa. */
export const POST = withApiRoute(async (req: NextRequest) => {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return apiUnauthorized("Sesión no válida");

  const body = await parseJsonBody(req);
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) return apiBadRequest(INVALID_INPUT);

  return apiServiceResult(
    await authService.changePassword(token, parsed.data, requestContext(req)),
  );
});
