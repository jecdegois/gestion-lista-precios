import {
  apiBadRequest,
  apiServiceResult,
  parseJsonBody,
  withApiRoute,
} from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { SignInSchema } from "@/features/auth/schemas/auth-schema";
import { authService } from "@/features/auth/services/auth-service";
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
} from "@/features/auth/session-cookie";

const INVALID_INPUT = "Datos inválidos";

/** Inicio de sesion; emite la cookie de sesion httpOnly en la respuesta. */
export const POST = withApiRoute(async (req: Request) => {
  const body = await parseJsonBody(req);
  const parsed = SignInSchema.safeParse(body);
  if (!parsed.success) return apiBadRequest(INVALID_INPUT);

  const result = await authService.signIn(parsed.data, requestContext(req));
  const { sessionToken, ...resultView } = result;

  const response = apiServiceResult(resultView);

  if (result.ok && sessionToken) {
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
});
