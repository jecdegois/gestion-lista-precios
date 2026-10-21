import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { envs } from "@/config/envs";
import { googleAuthUrl } from "@/features/auth/services/google-oidc";
import { GOOGLE_OAUTH_COOKIE, GOOGLE_OAUTH_COOKIE_PATH } from "./oauth-cookie";

// Sin esto Next prerenderiza el GET en el build y congela state/nonce para todos.
export const dynamic = "force-dynamic";

/** Inicia el login con Google: guarda state y nonce y redirige al consentimiento. */
export function GET() {
  const state = randomBytes(16).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");

  const response = NextResponse.redirect(googleAuthUrl(state, nonce));
  response.cookies.set(GOOGLE_OAUTH_COOKIE, `${state}.${nonce}`, {
    httpOnly: true,
    // lax: la cookie debe viajar en la redirección GET de vuelta desde Google.
    sameSite: "lax",
    secure: envs.NODE_ENV === "production",
    path: GOOGLE_OAUTH_COOKIE_PATH,
    maxAge: 10 * 60,
  });
  return response;
}
