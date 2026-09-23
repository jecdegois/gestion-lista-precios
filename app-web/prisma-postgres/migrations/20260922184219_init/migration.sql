CREATE EXTENSION IF NOT EXISTS citext;

-- CreateEnum
CREATE TYPE "AttemptType" AS ENUM ('login', 'signup', 'password_reset');

-- CreateEnum
CREATE TYPE "SessionRevokeReason" AS ENUM ('logout', 'password_change', 'password_reset', 'deactivation', 'permissions_change');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('password_reset', 'admin_invite');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'active', 'inactive');

-- CreateTable
CREATE TABLE "access_counters" (
    "key" CITEXT NOT NULL,
    "attempt_type" "AttemptType" NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked_until" TIMESTAMPTZ(6),

    CONSTRAINT "access_counters_pkey" PRIMARY KEY ("key","attempt_type")
);

-- CreateTable
CREATE TABLE "security_audit" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event" TEXT NOT NULL,
    "actor_id" UUID,
    "actor_email" CITEXT,
    "target_user_id" UUID,
    "company" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "details" JSONB,

    CONSTRAINT "security_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users_company" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "company" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "users_company_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" BYTEA NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" "SessionRevokeReason",
    "ip_address" INET,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" BYTEA NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "invalidated_at" TIMESTAMPTZ(6),
    "issued_by" UUID,

    CONSTRAINT "security_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'pending',
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "password_hash" TEXT,
    "password_updated_at" TIMESTAMPTZ(6),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "last_login_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_audit_occurred_at_idx" ON "security_audit"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "security_audit_target_user_id_occurred_at_idx" ON "security_audit"("target_user_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_company_user_id_company_key" ON "users_company"("user_id", "company");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_roles_users_company_id_role_id_key" ON "users_roles"("users_company_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "security_tokens_token_hash_key" ON "security_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "security_audit" ADD CONSTRAINT "security_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_audit" ADD CONSTRAINT "security_audit_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users_company" ADD CONSTRAINT "users_company_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_users_company_id_fkey" FOREIGN KEY ("users_company_id") REFERENCES "users_company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_tokens" ADD CONSTRAINT "security_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_tokens" ADD CONSTRAINT "security_tokens_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Índices parciales (no modelables por Prisma)
CREATE UNIQUE INDEX "users_roles_one_active_role_per_company" ON "users_roles"("users_company_id") WHERE "revoked_at" IS NULL;
CREATE INDEX "users_company_company_active_idx" ON "users_company"("company") WHERE "is_active";
CREATE INDEX "sessions_active_by_user_idx" ON "sessions"("user_id") WHERE "revoked_at" IS NULL;
CREATE INDEX "security_tokens_pending_idx" ON "security_tokens"("user_id", "purpose") WHERE "consumed_at" IS NULL AND "invalidated_at" IS NULL;
