import { apiBadRequest, apiServiceResult, parseJsonBody, withApiRoute } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { SetPasswordSchema } from "@/features/auth/schemas/auth-schema";
import { authService } from "@/features/auth/services/auth-service";

const INVALID_INPUT = "Datos inválidos";

type ResetPasswordBody = { token?: string } & {
  newPassword?: string;
  passwordConfirmation?: string;
};

/** Confirma el restablecimiento de contrasena usando el token del enlace. */
export const POST = withApiRoute(async (req: Request) => {
  const body = await parseJsonBody<ResetPasswordBody>(req);
  const token = body?.token;
  const parsed = SetPasswordSchema.safeParse(body);
  if (!parsed.success || !token) return apiBadRequest(INVALID_INPUT);

  return apiServiceResult(
    await authService.confirmPasswordReset(token, parsed.data, requestContext(req)),
  );
});
