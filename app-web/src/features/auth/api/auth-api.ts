import { GENERIC_NETWORK_ERROR, GENERIC_SERVER_ERROR } from "@/shared/api/api-types";
import {
  ChangePasswordInput,
  ForgotPasswordInput,
  SetPasswordInput,
  SignInInput,
  SignUpInput,
} from "../schemas/auth-schema";

export type AuthActionResult = { ok: boolean; error?: string; message?: string };

type ApiResultView = { ok?: boolean; error?: string; message?: string };

async function postAuth(url: string, body?: unknown): Promise<AuthActionResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = (await res.json()) as ApiResultView;
    if (typeof json.ok === "boolean") {
      return { ok: json.ok, error: json.error, message: json.message };
    }
    return { ok: false, error: GENERIC_SERVER_ERROR };
  } catch {
    return { ok: false, error: GENERIC_NETWORK_ERROR };
  }
}

export function signUp(input: SignUpInput) {
  return postAuth("/api/auth/registrar", input);
}

export function signIn(input: SignInInput) {
  return postAuth("/api/auth/login", input);
}

export function signOut() {
  return postAuth("/api/auth/logout");
}

export function forgotPassword(input: ForgotPasswordInput) {
  return postAuth("/api/auth/recuperar", input);
}

export function setPassword(input: SetPasswordInput, token: string) {
  return postAuth("/api/auth/restablecer", { ...input, token });
}

export function changePassword(input: ChangePasswordInput) {
  return postAuth("/api/auth/cambiar-password", input);
}
