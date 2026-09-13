import "server-only";
import type { ConnectionPool as MssqlConnectionPool } from "mssql";
import { resolverCompania } from "./companies";

/**
 * Pool único para la base SQL Server compartida por el Portal y Softland.
 * Cada repositorio califica los objetos con su esquema: PORTAL_PRECIOS para el
 * Portal y el esquema configurado de la compañía (por ejemplo, FEBECA) para
 * catálogos operativos.
 */
let sharedPool: MssqlConnectionPool | null = null;

function buildSharedSqlConfig() {
  return {
    server: process.env.PORTAL_DB_SERVER ?? "localhost",
    database: process.env.PORTAL_DB_NAME ?? "SOFTLANDQA",
    user: process.env.PORTAL_DB_USER ?? "app_user",
    password: process.env.PORTAL_DB_PASSWORD ?? "",
    port: Number(process.env.SQL_PORT ?? 1433),
    options: {
      encrypt: (process.env.SQL_ENCRYPT ?? "false").toLowerCase() === "true",
      trustServerCertificate: (process.env.SQL_TRUST_SERVER_CERTIFICATE ?? "true").toLowerCase() === "true",
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  };
}

/**
 * Obtiene el pool compartido para los catálogos de una compañía. La resolución
 * conserva la validación de la compañía y su esquema, sin abrir otra conexión.
 */
export async function getPool(compania: string): Promise<MssqlConnectionPool> {
  resolverCompania(compania);
  return getPortalPool();
}

/** Devuelve el esquema calificado de la compania (p. ej. "[FEBECA]"). */
export function esquemaDe(compania: string): string {
  return `[${resolverCompania(compania).schema}]`;
}

/**
 * Pool físico compartido. La conexión se configura una sola vez mediante
 * PORTAL_DB_*; los repositorios distinguen Portal y Softland por esquema.
 */
export async function getPortalPool(): Promise<MssqlConnectionPool> {
  if (sharedPool && sharedPool.connected) return sharedPool;
  const mssql = await import("mssql");
  const pool = new mssql.ConnectionPool(buildSharedSqlConfig());
  await pool.connect();
  sharedPool = pool;
  return pool;
}
