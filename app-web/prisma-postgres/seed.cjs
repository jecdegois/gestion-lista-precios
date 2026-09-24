// Seed de empresas, roles y asignación de empresas para usuarios administradores.
// Uso: npm run seed [-- operator|approver|auditor]   (default: operator)
const { PrismaClient } = require("../src/generated/postgres");

const prisma = new PrismaClient();

const ROLES = [
  { code: "operator", name: "Operador de Precios" },
  { code: "approver", name: "Aprobador de Precios" },
  { code: "auditor", name: "Auditor" },
];

const COMPANIES = [
  { code: "FEBECA", name: "FEBECA C.A.", sqlSchema: "FEBECA" },
  { code: "BEVAL", name: "BEVAL C.A.", sqlSchema: "BEVAL" },
  { code: "SILLACA", name: "SILLACA C.A.", sqlSchema: "SILLACA" },
];

async function main() {
  const roleCode = process.argv[2] ?? "operator";
  if (!ROLES.some((r) => r.code === roleCode)) throw new Error(`Rol inválido: ${roleCode}`);

  for (const company of COMPANIES) {
    await prisma.company.upsert({ where: { code: company.code }, update: {}, create: company });
  }
  const companias = (await prisma.company.findMany({ where: { isActive: true } })).map((c) => c.code);

  for (const role of ROLES) {
    await prisma.role.upsert({ where: { code: role.code }, update: {}, create: role });
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });

  const admins = await prisma.user.findMany({ where: { isAdmin: true } });
  if (!admins.length) console.warn("No hay usuarios con is_admin = true; solo se sembraron roles.");

  for (const user of admins) {
    for (const company of companias) {
      const userCompany = await prisma.userCompany.upsert({
        where: { userId_company: { userId: user.id, company } },
        update: { isActive: true, revokedAt: null },
        create: { userId: user.id, company },
      });
      const activo = await prisma.userRole.findFirst({
        where: { usersCompanyId: userCompany.id, revokedAt: null },
        include: { role: true },
      });
      if (activo) {
        console.log(`${user.email} · ${company}: ya tiene rol ${activo.role.code}, sin cambios`);
        continue;
      }
      await prisma.userRole.create({ data: { usersCompanyId: userCompany.id, roleId: role.id } });
      console.log(`${user.email} · ${company}: asignado rol ${role.code}`);
    }
  }
}

main()
  .catch((error) => {
    console.error("Error:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
