import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { envs } from "@/config/envs";
import { withApiRoute } from "@/shared/api";
import { requestContext } from "@/features/auth/api/request-context";
import { authService, type AuthResult } from "@/features/auth/services/auth-service";
import { exchangeGoogleCode } from "@/features/auth/services/google-oidc";
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
} from "@/features/auth/session-cookie";
import { GOOGLE_OAUTH_COOKIE, GOOGLE_OAUTH_COOKIE_PATH } from "../oauth-cookie";

const PENDING_MESSAGE = "Su cuenta está pendiente de aprobación";

/** Vuelta del consentimiento de Google: valida, crea la sesión y redirige. */
export const GET = withApiRoute(async (req: Request) => {
  const url = new URL(req.url);
  const [state, nonce] = ((await cookies()).get(GOOGLE_OAUTH_COOKIE)?.value ?? "").split(".");
  const code = url.searchParams.get("code");

  const backToLogin = (key: "error" | "aviso", message: string) => {
    const target = new URL("/auth/login", url);
    target.searchParams.set(key, message);
    return NextResponse.redirect(target);
  };

  let response: NextResponse;

  if (!code || !state || url.searchParams.get("state") !== state) {
    response = backToLogin("error", "No se pudo iniciar sesión con Google. Intente nuevamente.");
  } else {
    const identity = await exchangeGoogleCode(code, nonce);
    const result: AuthResult & { sessionToken?: string } = identity
      ? await authService.signInWithGoogle(identity, requestContext(req))
      : { ok: false, error: "No se pudo validar la cuenta de Google" };

    if (result.message === PENDING_MESSAGE) {
      response = backToLogin("aviso", PENDING_MESSAGE);
    } else if (!result.ok || !result.sessionToken) {
      response = backToLogin("error", result.error ?? "No se pudo iniciar sesión con Google");
    } else {
      response = NextResponse.redirect(new URL("/", url));
      response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: envs.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
      });
    }
  }

  response.cookies.set(GOOGLE_OAUTH_COOKIE, "", { path: GOOGLE_OAUTH_COOKIE_PATH, maxAge: 0 });
  return response;
});
