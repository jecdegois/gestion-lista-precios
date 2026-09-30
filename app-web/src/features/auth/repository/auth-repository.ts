import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/postgres";

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export const RATE_LIMIT = {
  attempts: 5,
  windowMs: 15 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
} as const;

export type AttemptType = "login" | "signup" | "password_reset";

type TokenPurpose = "password_reset" | "admin_invite";

export type AuditInput = {
  event: string;
  actorId?: string;
  actorEmail?: string;
  targetUserId?: string;
  company?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Prisma.InputJsonValue;
};

const users = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { companies: { where: { isActive: true, revokedAt: null } } },
    });
  },

  createPending(input: { email: string; fullName: string; passwordHash: string }) {
    return prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        passwordHash: input.passwordHash,
        status: "pending",
      },
    });
  },

  recordLogin(id: string) {
    return prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  },

  changePassword(id: string, passwordHash: string) {
    return prisma.user.update({
      where: { id },
      data: { passwordHash, passwordUpdatedAt: new Date(), mustChangePassword: false },
    });
  },
};

const sessions = {
  issue(input: { userId: string; ipAddress?: string; userAgent?: string }) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    return prisma.session.create({ data: { ...input, tokenHash, expiresAt } }).then((session) => ({
      token,
      session,
    }));
  },

  resolve(token: string) {
    const tokenHash = createHash("sha256").update(token).digest();
    return prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            companies: {
              where: { isActive: true, revokedAt: null },
              include: {
                companyInfo: { select: { currencySymbol: true } },
                userRoles: {
                  where: { revokedAt: null },
                  include: { role: true },
                },
              },
            },
          },
        },
      },
    });
  },

  touch(id: string) {
    return prisma.session.update({ where: { id }, data: { lastUsedAt: new Date() } });
  },

  revoke(id: string, reason: "logout" | "password_change") {
    return prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  },

  revokeAllForUser(
    userId: string,
    reason: "password_change" | "password_reset" | "deactivation" | "permissions_change",
    exceptSessionId?: string,
  ) {
    return prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        id: exceptSessionId ? { not: exceptSessionId } : undefined,
      },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  },

  purgeExpired() {
    const now = new Date();
    return prisma.$transaction([
      prisma.session.deleteMany({ where: { expiresAt: { lte: now } } }),
      prisma.securityToken.deleteMany({
        where: { expiresAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
      }),
    ]);
  },
};

const tokenTtlMs = {
  password_reset: 30 * 60 * 1000,
  admin_invite: 24 * 60 * 60 * 1000,
} as const;

const tokens = {
  async issue(userId: string, purpose: keyof typeof tokenTtlMs, issuedBy?: string) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest();
    const expiresAt = new Date(Date.now() + tokenTtlMs[purpose]);

    await prisma.$transaction([
      prisma.securityToken.updateMany({
        where: { userId, purpose, consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
      }),
      prisma.securityToken.create({
        data: { userId, purpose, tokenHash, expiresAt, issuedById: issuedBy },
      }),
    ]);

    return token;
  },

  async consume(token: string) {
    const tokenHash = createHash("sha256").update(token).digest();
    const record = await prisma.securityToken.findUnique({ where: { tokenHash } });

    if (!record || record.consumedAt || record.invalidatedAt || record.expiresAt <= new Date()) {
      return null;
    }

    return prisma.securityToken
      .update({ where: { id: record.id }, data: { consumedAt: new Date() } })
      .then(() => record);
  },
};

const counters = {
  async isBlocked(key: string, attemptType: AttemptType) {
    const counter = await prisma.accessCounter.findUnique({
      where: { key_attemptType: { key, attemptType } },
    });
    return !!counter?.blockedUntil && counter.blockedUntil > new Date();
  },

  async registerFailure(key: string, attemptType: AttemptType) {
    const now = new Date();
    const counter = await prisma.accessCounter.findUnique({
      where: { key_attemptType: { key, attemptType } },
    });
    const windowExpired =
      !counter || counter.windowStart.getTime() <= now.getTime() - RATE_LIMIT.windowMs;
    const attempts = windowExpired ? 1 : counter.attempts + 1;
    const blockedUntil =
      attempts >= RATE_LIMIT.attempts ? new Date(now.getTime() + RATE_LIMIT.blockMs) : null;

    await prisma.accessCounter.upsert({
      where: { key_attemptType: { key, attemptType } },
      create: { key, attemptType, attempts: 1, windowStart: now, lastAttemptAt: now, blockedUntil },
      update: {
        attempts,
        windowStart: windowExpired ? now : counter.windowStart,
        lastAttemptAt: now,
        blockedUntil,
      },
    });
  },

  reset(key: string, attemptType: AttemptType) {
    return prisma.accessCounter.deleteMany({ where: { key, attemptType } });
  },
};

const audit = {
  async record(input: AuditInput) {
    try {
      await prisma.securityAudit.create({
        data: {
          event: input.event,
          actorId: input.actorId,
          actorEmail: input.actorEmail,
          targetUserId: input.targetUserId,
          company: input.company,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          details: input.details ?? undefined,
        },
      });
    } catch {
      return undefined;
    }
  },
};

export const authRepository = { users, sessions, tokens, counters, audit };
