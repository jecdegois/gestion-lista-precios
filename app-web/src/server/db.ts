import "server-only";
import type { ConnectionPool as MssqlConnectionPool } from "mssql";
import { resolverCompania } from "./companies";

/**
 * Dos bases en el mismo servidor y con el mismo login (PORTAL_DB_*):
 * - PORTAL_DB_NAME (PORTAL_PRECIOS): estado del portal, un esquema por empresa.
 * - SOFTLAND_DB_NAME (SOFTLANDQA): catálogos de Softland, solo lectura.
 */
const pools = new Map<string, Promise<MssqlConnectionPool>>();

function buildSqlConfig(database: string) {
  return {
    server: process.env.PORTAL_DB_SERVER ?? "localhost",
    database,
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

async function poolFor(database: string): Promise<MssqlConnectionPool> {
  const existing = await pools.get(database)?.catch(() => null);
  if (existing?.connected) return existing;
  const connecting = import("mssql").then((mssql) => new mssql.ConnectionPool(buildSqlConfig(database)).connect());
  pools.set(database, connecting);
  connecting.catch(() => pools.delete(database));
  return connecting;
}

/** Pool de Softland para los catálogos de una compañía (valida que la compañía exista). */
export async function getPool(compania: string): Promise<MssqlConnectionPool> {
  resolverCompania(compania);
  return poolFor(process.env.SOFTLAND_DB_NAME ?? "SOFTLANDQA");
}

/** Devuelve el esquema calificado de la compania (p. ej. "[FEBECA]"). */
export function esquemaDe(compania: string): string {
  return `[${resolverCompania(compania).schema}]`;
}

/** Pool de la BD del portal; las tablas se califican con el esquema de la empresa. */
export async function getPortalPool(): Promise<MssqlConnectionPool> {
  return poolFor(process.env.PORTAL_DB_NAME ?? "PORTAL_PRECIOS");
}
