import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/postgres";
import type { AuthContext } from "@/lib/domain-types";
import { authRepository } from "@/features/auth/repository/auth-repository";
import { hashPassword } from "@/features/auth/services/auth-service";
import { usersRepository as repo } from "../repository/users-repository";
import type { ApproveUserInput, CreateUserInput, UpdateUserInput } from "../schemas/user-schema";
import type { Assignment } from "../types";

const { sessions, audit } = authRepository;

type RequestContext = { ip?: string; userAgent?: string };
type Failure = { ok: false; error: string };

const NOT_FOUND: Failure = { ok: false, error: "El usuario no existe" };
const LAST_ADMIN: Failure = { ok: false, error: "No se puede dejar el sistema sin administradores activos" };

/** 16 caracteres base64url (96 bits): cumple el mínimo de 15 de la política. */
function temporaryPassword() {
  return randomBytes(12).toString("base64url");
}

function assignmentsKey(assignments: Assignment[]) {
  return assignments.map((a) => `${a.company}:${a.role}`).sort().join("|");
}

async function validateCompanies(assignments: Assignment[]): Promise<Failure | null> {
  const { companies } = await repo.catalogs();
  const valid = new Set(companies.map((c) => c.code));
  const invalid = assignments.find((a) => !valid.has(a.company));
  return invalid ? { ok: false, error: `La compañía ${invalid.company} no existe o está inactiva` } : null;
}

function recordAudit(
  session: AuthContext,
  ctx: RequestContext,
  event: string,
  targetUserId: string,
  details?: Prisma.InputJsonValue,
) {
  return audit.record({
    event,
    actorId: session.userId,
    actorEmail: session.email,
    targetUserId,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
    details,
  });
}

export const usersService = {
  async list() {
    const [users, catalogs] = await Promise.all([repo.list(), repo.catalogs()]);
    return { ok: true as const, users, ...catalogs };
  },

  /** Alta administrativa: la cuenta nace activa con contraseña temporal (se muestra una sola vez). */
  async create(session: AuthContext, input: CreateUserInput, ctx: RequestContext) {
    const invalid = await validateCompanies(input.assignments);
    if (invalid) return invalid;
    if (await authRepository.users.findByEmail(input.email)) {
      return { ok: false as const, error: "Ya existe un usuario con ese correo" };
    }

    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const created = await repo.create({ ...input, passwordHash, approvedById: session.userId }, tx);
      await repo.replaceAssignments(created.id, input.assignments, session.userId, tx);
      return repo.find(created.id, tx);
    });

    await recordAudit(session, ctx, "user_created", user!.id, { isAdmin: input.isAdmin, assignments: input.assignments });
    return { ok: true as const, message: "Usuario creado", user, temporaryPassword: password };
  },

  async update(session: AuthContext, id: string, input: UpdateUserInput, ctx: RequestContext) {
    const current = await repo.find(id);
    if (!current) return NOT_FOUND;
    if (current.status === "pending") return { ok: false as const, error: "Apruebe la solicitud antes de editar sus permisos" };
    const invalid = await validateCompanies(input.assignments);
    if (invalid) return invalid;
    if (current.isAdmin && !input.isAdmin && current.status === "active" && !(await repo.countOtherActiveAdmins(id))) {
      return LAST_ADMIN;
    }

    const permissionsChanged =
      current.isAdmin !== input.isAdmin || assignmentsKey(current.assignments) !== assignmentsKey(input.assignments);

    const user = await prisma.$transaction(async (tx) => {
      await repo.update(id, { fullName: input.fullName, isAdmin: input.isAdmin }, tx);
      if (permissionsChanged) await repo.replaceAssignments(id, input.assignments, session.userId, tx);
      return repo.find(id, tx);
    });

    if (permissionsChanged) {
      // Las sesiones del usuario se revocan; si se edita a sí mismo conserva la actual.
      await sessions.revokeAllForUser(id, "permissions_change", id === session.userId ? session.sessionId : undefined);
      await recordAudit(session, ctx, "permissions_changed", id, {
        before: { isAdmin: current.isAdmin, assignments: current.assignments },
        after: { isAdmin: input.isAdmin, assignments: input.assignments },
      });
    }
    return { ok: true as const, message: "Usuario actualizado", user };
  },

  /** Aprueba una solicitud de registro asignando sus compañías y roles. */
  async approve(session: AuthContext, id: string, input: ApproveUserInput, ctx: RequestContext) {
    const current = await repo.find(id);
    if (!current) return NOT_FOUND;
    if (current.status !== "pending") return { ok: false as const, error: "El usuario no está pendiente de aprobación" };
    const invalid = await validateCompanies(input.assignments);
    if (invalid) return invalid;

    const user = await prisma.$transaction(async (tx) => {
      await repo.update(
        id,
        { status: "active", isAdmin: input.isAdmin, approvedAt: new Date(), approvedBy: { connect: { id: session.userId } } },
        tx,
      );
      await repo.replaceAssignments(id, input.assignments, session.userId, tx);
      return repo.find(id, tx);
    });

    await recordAudit(session, ctx, "user_approved", id, { isAdmin: input.isAdmin, assignments: input.assignments });
    return { ok: true as const, message: `${current.fullName} fue aprobado`, user };
  },

  /** Desactiva una cuenta activa o rechaza una solicitud pendiente (baja lógica, conserva historial). */
  async deactivate(session: AuthContext, id: string, ctx: RequestContext) {
    if (id === session.userId) return { ok: false as const, error: "No puede desactivar su propia cuenta" };
    const current = await repo.find(id);
    if (!current) return NOT_FOUND;
    if (current.status === "inactive") return { ok: false as const, error: "El usuario ya está inactivo" };
    if (current.isAdmin && current.status === "active" && !(await repo.countOtherActiveAdmins(id))) return LAST_ADMIN;

    await repo.update(id, { status: "inactive" });
    await sessions.revokeAllForUser(id, "deactivation");
    const rejected = current.status === "pending";
    await recordAudit(session, ctx, "user_deactivated", id, { rejected });
    return { ok: true as const, message: rejected ? "Solicitud rechazada" : "Usuario desactivado", user: await repo.find(id) };
  },

  /** Reactiva una cuenta; si nunca fue aprobada vuelve a pendiente para asignarle permisos. */
  async reactivate(session: AuthContext, id: string, ctx: RequestContext) {
    const current = await repo.find(id);
    if (!current) return NOT_FOUND;
    if (current.status !== "inactive") return { ok: false as const, error: "El usuario no está inactivo" };

    const status = current.approvedAt ? "active" : "pending";
    await repo.update(id, { status });
    await recordAudit(session, ctx, "user_reactivated", id, { status });
    return {
      ok: true as const,
      message: status === "active" ? "Usuario reactivado" : "Solicitud devuelta a pendientes",
      user: await repo.find(id),
    };
  },

  /** Restablecimiento administrativo: contraseña temporal mostrada una sola vez y cambio obligatorio. */
  async resetPassword(session: AuthContext, id: string, ctx: RequestContext) {
    if (id === session.userId) return { ok: false as const, error: "Use el cambio de contraseña de su cuenta" };
    const current = await repo.find(id);
    if (!current) return NOT_FOUND;
    if (current.status !== "active") return { ok: false as const, error: "Solo se restablece la contraseña de usuarios activos" };

    const password = temporaryPassword();
    await repo.update(id, {
      passwordHash: await hashPassword(password),
      passwordUpdatedAt: new Date(),
      mustChangePassword: true,
    });
    await sessions.revokeAllForUser(id, "password_reset");
    await recordAudit(session, ctx, "password_reset", id, { byAdmin: true });
    return { ok: true as const, message: "Contraseña restablecida", temporaryPassword: password };
  },
};
