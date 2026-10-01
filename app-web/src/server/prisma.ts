import { envs } from "@/config/envs";
import { PrismaClient } from "@/generated/postgres";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: envs.DATABASE_URL });

if (envs.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
