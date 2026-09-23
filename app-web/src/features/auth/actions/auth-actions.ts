"use server";

import { cookies, headers } from "next/headers";
import {
  ChangePasswordInput,
  ChangePasswordSchema,
  ForgotPasswordInput,
  ForgotPasswordSchema,
  SetPasswordInput,
  SetPasswordSchema,
  SignInInput,
  SignInSchema,
  SignUpInput,
  SignUpSchema,
} from "../schemas/auth-schema";
import { authService } from "../services/auth-service";
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
} from "../session-cookie";

const INVALID_INPUT = "Datos inválidos";

async function requestContext() {
  const headerList = await headers();
  return {
    ip: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: headerList.get("user-agent") ?? undefined,
  };
}

export async function signUpAction(input: SignUpInput) {
  const parsed = SignUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: INVALID_INPUT };
  }
  return authService.signUp(parsed.data, await requestContext());
}

export async function signInAction(input: SignInInput) {
  const parsed = SignInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: INVALID_INPUT };
  }

  const result = await authService.signIn(parsed.data, await requestContext());

  if (result.ok && result.sessionToken) {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return { ok: result.ok, error: result.error, message: result.message };
}

export async function signOutAction() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const context = await authService.resolveContext(token);
    if (context) {
      await authService.signOut(context.sessionId, context.user.id);
    }
    cookieStore.delete(SESSION_COOKIE_NAME);
  }

  return { ok: true };
}

export async function forgotPasswordAction(input: ForgotPasswordInput) {
  const parsed = ForgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: INVALID_INPUT };
  }
  return authService.requestPasswordReset(parsed.data, await requestContext());
}

export async function setPasswordAction(input: SetPasswordInput, token: string) {
  const parsed = SetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: INVALID_INPUT };
  }
  return authService.confirmPasswordReset(token, parsed.data, await requestContext());
}

export async function changePasswordAction(input: ChangePasswordInput) {
  const parsed = ChangePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: INVALID_INPUT };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return { ok: false, error: "Sesión no válida" };
  }

  return authService.changePassword(token, parsed.data, await requestContext());
}
