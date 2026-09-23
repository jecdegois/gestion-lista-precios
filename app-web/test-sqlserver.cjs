const { PrismaClient } = require("./src/generated/sqlserver");

const prisma = new PrismaClient();

async function main() {
  const version = await prisma.$queryRaw`SELECT @@VERSION AS version`;
  console.log("Conexión OK:", version[0].version.split("\n")[0]);

  const rows = await prisma.$queryRaw`SELECT TOP 5 * FROM PORTAL_PRECIOS.USUARIO ORDER BY FECHA_CREACION DESC`;
  console.log(`SOLICITUD_PRECIO (${rows.length} filas):`);
  for (const row of rows) {
    console.log(" -", row);
  }
}

main()
  .catch((error) => {
    console.error("Error:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
