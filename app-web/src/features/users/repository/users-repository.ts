import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/postgres";
import type { RoleCode } from "@/lib/domain-types";
import type { Assignment, Catalogs, UserView } from "../types";

type Tx = Prisma.TransactionClient;

const includeAssignments = {
  approvedBy: { select: { fullName: true } },
  companies: {
    where: { isActive: true, revokedAt: null },
    include: { userRoles: { where: { revokedAt: null }, include: { role: true } } },
  },
} satisfies Prisma.UserInclude;

type UserWithAssignments = Prisma.UserGetPayload<{ include: typeof includeAssignments }>;

function toView(user: UserWithAssignments): UserView {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    isAdmin: user.isAdmin,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
    approvedAt: user.approvedAt?.toISOString() ?? null,
    approvedBy: user.approvedBy?.fullName ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    assignments: user.companies.flatMap((uc) =>
      uc.userRoles.map((ur) => ({ company: uc.company, role: ur.role.code as RoleCode })),
    ),
  };
}

export const usersRepository = {
  async list(): Promise<UserView[]> {
    const users = await prisma.user.findMany({ include: includeAssignments, orderBy: { createdAt: "desc" } });
    return users.map(toView);
  },

  async find(id: string, tx: Tx = prisma): Promise<UserView | null> {
    const user = await tx.user.findUnique({ where: { id }, include: includeAssignments });
    return user ? toView(user) : null;
  },

  async catalogs(): Promise<Catalogs> {
    const [companies, roles] = await Promise.all([
      prisma.company.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
      prisma.role.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { companies, roles: roles as Catalogs["roles"] };
  },

  /** Administradores activos distintos de `excludedId` (protección del último admin). */
  countOtherActiveAdmins(excludedId: string, tx: Tx = prisma) {
    return tx.user.count({ where: { isAdmin: true, status: "active", id: { not: excludedId } } });
  },

  create(input: { email: string; fullName: string; isAdmin: boolean; passwordHash: string; approvedById: string }, tx: Tx) {
    const now = new Date();
    return tx.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        isAdmin: input.isAdmin,
        passwordHash: input.passwordHash,
        passwordUpdatedAt: now,
        mustChangePassword: true,
        status: "active",
        approvedAt: now,
        approvedById: input.approvedById,
      },
    });
  },

  update(id: string, data: Prisma.UserUpdateInput, tx: Tx = prisma) {
    return tx.user.update({ where: { id }, data });
  },

  /**
   * Deja las asignaciones vigentes del usuario iguales a `assignments`: revoca las
   * compañías y roles que sobran, reactiva o crea los que faltan. Conserva el historial.
   */
  async replaceAssignments(userId: string, assignments: Assignment[], actorId: string, tx: Tx) {
    const now = new Date();
    const desired = new Map(assignments.map((a) => [a.company, a.role]));
    const roles = await tx.role.findMany({ where: { code: { in: [...new Set(assignments.map((a) => a.role))] } } });
    const roleIdByCode = new Map(roles.map((r) => [r.code, r.id]));

    const current = await tx.userCompany.findMany({ where: { userId, isActive: true, revokedAt: null } });

    for (const uc of current) {
      if (desired.has(uc.company)) continue;
      await tx.userRole.updateMany({ where: { usersCompanyId: uc.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.userCompany.update({ where: { id: uc.id }, data: { isActive: false, revokedAt: now } });
    }

    for (const [company, role] of desired) {
      const roleId = roleIdByCode.get(role);
      if (!roleId) throw new Error(`Rol no configurado: ${role}`);

      const uc = await tx.userCompany.upsert({
        where: { userId_company: { userId, company } },
        update: { isActive: true, revokedAt: null },
        create: { userId, company, assignedBy: actorId },
      });
      await tx.userRole.updateMany({
        where: { usersCompanyId: uc.id, revokedAt: null, roleId: { not: roleId } },
        data: { revokedAt: now },
      });
      await tx.userRole.upsert({
        where: { usersCompanyId_roleId: { usersCompanyId: uc.id, roleId } },
        update: { revokedAt: null },
        create: { usersCompanyId: uc.id, roleId, assignedBy: actorId },
      });
    }
  },
};
