import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import {
  SignUpInput,
  SignInInput,
  ForgotPasswordInput,
  SetPasswordInput,
  ChangePasswordInput,
} from "../schemas/auth-schema";
import { authRepository } from "../repository/auth-repository";
import type { GoogleIdentity } from "./google-oidc";
import { companyLogoUrl } from "@/features/settings/utils/company-logo";

const { users, sessions, tokens, audit } = authRepository;

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_LENGTH = 16;

function derivePassword(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(PASSWORD_SALT_LENGTH);
  const derived = await derivePassword(password, salt, PASSWORD_KEY_LENGTH, SCRYPT_PARAMS);
  return [
    "scrypt",
    `N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}`,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const [scheme, params, saltBase64, hashBase64] = stored.split("$");
  if (scheme !== "scrypt" || !params || !saltBase64 || !hashBase64) return false;

  const options = Object.fromEntries(
    params.split(",").map((pair) => pair.split("=") as [string, string]),
  );
  const salt = Buffer.from(saltBase64, "base64");
  const expected = Buffer.from(hashBase64, "base64");
  const derived = await derivePassword(password, salt, expected.length, {
    N: Number(options.N),
    r: Number(options.r),
    p: Number(options.p),
  });

  return timingSafeEqual(derived, expected);
}

export type AuthResult = { ok: boolean; error?: string; message?: string; resetToken?: string };

type RequestContext = { ip?: string; userAgent?: string };

const GENERIC_CREDENTIALS_ERROR = "Credenciales inválidas";
const GENERIC_RESET_MESSAGE =
  "Si el correo corresponde a una cuenta activa, recibirá el enlace de recuperación.";

class AuthService {
  async signUp(input: SignUpInput, ctx: RequestContext): Promise<AuthResult> {
    const existing = await users.findByEmail(input.email);
    if (existing) {
      return { ok: true, message: "Solicitud recibida. La cuenta queda pendiente de aprobación." };
    }

    const passwordHash = await hashPassword(input.password);
    const user = await users.createPending({
      email: input.email,
      fullName: input.name,
      passwordHash,
    });
    await audit.record({
      event: "signup_requested",
      actorEmail: user.email,
      targetUserId: user.id,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return { ok: true, message: "Solicitud recibida. La cuenta queda pendiente de aprobación." };
  }

  async signIn(
    input: SignInInput,
    ctx: RequestContext,
  ): Promise<AuthResult & { sessionToken?: string }> {
    const user = await users.findByEmail(input.email);
    const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? null);

    if (!user || !passwordOk || user.status === "inactive") {
      await audit.record({
        event: "login_failed",
        actorEmail: input.email,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return { ok: false, error: "Credenciales inválidas" };
    }

    return this.startSession(user, "password", ctx);
  }

  /**
   * Login con Google: busca por sub y, la primera vez, enlaza por email.
   * No crea cuentas; el correo debe existir en el portal.
   */
  async signInWithGoogle(
    identity: GoogleIdentity,
    ctx: RequestContext,
  ): Promise<AuthResult & { sessionToken?: string }> {
    let user = await users.findByGoogleSub(identity.sub);

    if (!user) {
      const byEmail = await users.findByEmail(identity.email);
      // Si el usuario ya tiene otra cuenta de Google enlazada, no se reemplaza.
      if (byEmail && !byEmail.googleSub) {
        user = await users.linkGoogle(byEmail.id, identity.sub);
      }
    }

    if (!user || user.status === "inactive") {
      await audit.record({
        event: "login_failed",
        actorEmail: identity.email,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
        details: { provider: "google" },
      });
      return { ok: false, error: "No hay una cuenta activa del portal para ese correo de Google" };
    }
    // Sin sesión: el login de Google vuelve a la pantalla de login con el aviso.
    if (user.status === "pending") {
      return { ok: true, message: "Su cuenta está pendiente de aprobación" };
    }

    return this.startSession(user, "google", ctx);
  }

  private async startSession(
    user: { id: string; email: string; status: string },
    authProvider: "password" | "google",
    ctx: RequestContext,
  ): Promise<AuthResult & { sessionToken?: string }> {
    await sessions.purgeExpired();

    const { token } = await sessions.issue({
      userId: user.id,
      authProvider,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
    await users.recordLogin(user.id);
    await audit.record({
      event: "session_started",
      actorId: user.id,
      actorEmail: user.email,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      ok: true,
      sessionToken: token,
      message:
        user.status === "pending" ? "Su cuenta está pendiente de aprobación" : "Sesión iniciada",
    };
  }

  async signOut(sessionId: string, userId: string): Promise<AuthResult> {
    await sessions.revoke(sessionId, "logout");
    await audit.record({ event: "session_ended", actorId: userId });
    return { ok: true, message: "Sesión cerrada" };
  }

  async requestPasswordReset(input: ForgotPasswordInput, ctx: RequestContext): Promise<AuthResult> {
    const user = await users.findByEmail(input.email);

    if (user && user.status === "active" && user.passwordHash) {
      const token = await tokens.issue(user.id, "password_reset");
      await audit.record({
        event: "password_reset",
        actorId: user.id,
        actorEmail: user.email,
        targetUserId: user.id,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return { ok: true, resetToken: token, message: GENERIC_RESET_MESSAGE };
    }

    return { ok: true, message: GENERIC_RESET_MESSAGE };
  }

  async confirmPasswordReset(
    token: string,
    input: SetPasswordInput,
    ctx: RequestContext,
  ): Promise<AuthResult> {
    const record = await tokens.consume(token);

    if (!record || record.purpose !== "password_reset") {
      return { ok: false, error: "El enlace no es válido o expiró" };
    }

    const user = await users.findById(record.userId);

    if (!user || user.status !== "active") {
      return { ok: false, error: "El enlace no es válido o expiró" };
    }

    const passwordHash = await hashPassword(input.newPassword);
    await users.changePassword(user.id, passwordHash);
    await sessions.revokeAllForUser(user.id, "password_reset");
    await audit.record({
      event: "password_changed",
      actorId: user.id,
      actorEmail: user.email,
      targetUserId: user.id,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      ok: true,
      message: "Contraseña reestablecida. Inicie sesión con la nueva contraseña.",
    };
  }

  async changePassword(
    sessionToken: string,
    input: ChangePasswordInput,
    ctx: RequestContext,
  ): Promise<AuthResult> {
    const resolved = await this.resolveContext(sessionToken);

    if (!resolved) {
      return { ok: false, error: "Sesión no válida" };
    }

    const user = await users.findById(resolved.user.id);

    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      return { ok: false, error: "La contraseña actual no es correcta" };
    }

    const passwordHash = await hashPassword(input.newPassword);
    await users.changePassword(user.id, passwordHash);
    await sessions.revokeAllForUser(user.id, "password_change", resolved.sessionId);
    await audit.record({
      event: "password_changed",
      actorId: user.id,
      actorEmail: user.email,
      targetUserId: user.id,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return { ok: true, message: "Contraseña actualizada" };
  }

  async resolveContext(sessionToken: string) {
    const record = await sessions.resolve(sessionToken);

    if (!record) return null;

    const valid =
      !record.revokedAt &&
      record.expiresAt > new Date() &&
      record.user.status !== "inactive" &&
      (!record.user.passwordUpdatedAt || record.createdAt >= record.user.passwordUpdatedAt);

    if (!valid) return null;

    return {
      sessionId: record.id,
      expiresAt: record.expiresAt,
      activeCompany: record.activeCompany,
      user: {
        id: record.user.id,
        email: record.user.email,
        fullName: record.user.fullName,
        status: record.user.status,
        isAdmin: record.user.isAdmin,
        // Quien entra con Google no conoce la contraseña temporal: no se le exige cambiarla.
        mustChangePassword: record.user.mustChangePassword && record.authProvider === "password",
        companies: record.user.companies.flatMap((companyRecord) =>
          companyRecord.userRoles.map((userRole) => ({
            company: companyRecord.company,
            currencySymbol: companyRecord.companyInfo.currencySymbol,
            brandColor: companyRecord.companyInfo.brandColor,
            logoUrl: companyLogoUrl(companyRecord.company, companyRecord.companyInfo.logoUpdatedAt),
            role: userRole.role.code,
          })),
        ),
      },
    };
  }
}

export const authService = new AuthService();
