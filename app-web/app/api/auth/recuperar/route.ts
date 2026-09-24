import { apiBadRequest, apiServiceResult, parseJsonBody, withApiRoute } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { ForgotPasswordSchema } from "@/features/auth/schemas/auth-schema";
import { authService } from "@/features/auth/services/auth-service";

const INVALID_INPUT = "Datos inválidos";

/** Solicitud de restablecimiento de contrasena (respuesta siempre neutral). */
export const POST = withApiRoute(async (req: Request) => {
  const body = await parseJsonBody(req);
  const parsed = ForgotPasswordSchema.safeParse(body);
  if (!parsed.success) return apiBadRequest(INVALID_INPUT);

  return apiServiceResult(
    await authService.requestPasswordReset(parsed.data, requestContext(req)),
  );
});
