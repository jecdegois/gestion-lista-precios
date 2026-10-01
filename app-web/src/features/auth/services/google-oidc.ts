import "server-only";
import { envs } from "@/config/envs";

// Flujo authorization code de OpenID Connect contra Google:
// https://developers.google.com/identity/openid-connect/openid-connect
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleIdentity = { sub: string; email: string; name?: string };

export function googleAuthUrl(state: string, nonce: string): string {
  const params = new URLSearchParams({
    client_id: envs.GOOGLE_CLIENT_ID,
    redirect_uri: envs.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

/**
 * Canjea el code por el id_token y valida sus claims. No se verifica la firma:
 * el token llega directo del endpoint de Google por HTTPS autenticado con el
 * client secret (lo que la documentación de Google considera suficiente).
 * Devuelve null si el canje o cualquier claim falla.
 */
export async function exchangeGoogleCode(code: string, nonce: string): Promise<GoogleIdentity | null> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: envs.GOOGLE_CLIENT_ID,
      client_secret: envs.GOOGLE_CLIENT_SECRET,
      redirect_uri: envs.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) return null;

  const { id_token: idToken } = (await response.json()) as { id_token?: string };
  const payload = idToken?.split(".")[1];
  if (!payload) return null;

  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const valid =
    ISSUERS.includes(claims.iss) &&
    claims.aud === envs.GOOGLE_CLIENT_ID &&
    claims.exp * 1000 > Date.now() &&
    claims.nonce === nonce &&
    claims.email_verified === true &&
    typeof claims.sub === "string" &&
    typeof claims.email === "string";

  return valid ? { sub: claims.sub, email: claims.email, name: claims.name } : null;
}
