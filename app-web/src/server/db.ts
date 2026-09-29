import "server-only";
import type { ConnectionPool as MssqlConnectionPool } from "mssql";
import { PrismaClient as SoftlandClient } from "@/generated/softland";
import { Prisma, PrismaClient as PortalClient } from "@/generated/sqlserver";
import { resolverCompania } from "./companies";

/**
 * Dos bases en el mismo servidor y con el mismo login (PORTAL_DB_*):
 * - PORTAL_DB_NAME (PORTAL_PRECIOS): estado del portal, un esquema por empresa (Prisma, ver portalDb).
 * - SOFTLAND_DB_NAME (SOFTLANDQA): catálogos de Softland, solo lectura (mssql).
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

/** URL de Prisma (SQL Server) con el login PORTAL_DB_*. SQL Server no tiene search_path: el esquema va en `schema`. */
function urlSqlServer(database: string, schema: string): string {
  const e = process.env;
  return (
    `sqlserver://${e.PORTAL_DB_SERVER ?? "localhost"}:${e.SQL_PORT ?? 1433};` +
    `database=${database};user=${e.PORTAL_DB_USER ?? "app_user"};` +
    `password={${e.PORTAL_DB_PASSWORD ?? ""}};encrypt=${(e.SQL_ENCRYPT ?? "false").toLowerCase()};` +
    `trustServerCertificate=${(e.SQL_TRUST_SERVER_CERTIFICATE ?? "true").toLowerCase()};schema=${schema}`
  );
}

/**
 * Clientes Prisma cacheados por base+esquema (sobreviven al hot reload).
 * Ojo: el SQL crudo ($queryRaw) NO usa el esquema de la URL; ahí calificar con objetoPortal()/objetoCalificado().
 */
const globalClients = globalThis as unknown as { prismaSqlServer?: Map<string, PortalClient | SoftlandClient> };
const clients = (globalClients.prismaSqlServer ??= new Map());

function cliente<T extends PortalClient | SoftlandClient>(Client: new (o: { datasourceUrl: string }) => T, database: string, schema: string): T {
  const key = `${database}.${schema}`;
  let c = clients.get(key) as T | undefined;
  if (!c) {
    c = new Client({ datasourceUrl: urlSqlServer(database, schema) });
    clients.set(key, c);
  }
  return c;
}

/** BD del portal (PORTAL_PRECIOS), esquema de la compañía. */
export function portalDb(compania: string): PortalClient {
  return cliente(PortalClient, process.env.PORTAL_DB_NAME ?? "PORTAL_PRECIOS", resolverCompania(compania).schema);
}

/** Softland, esquema de la compañía (NIVEL_PRECIO, VERSION_NIVEL). */
export function softlandDb(compania: string): SoftlandClient {
  return cliente(SoftlandClient, process.env.SOFTLAND_DB_NAME ?? "SOFTLANDQA", resolverCompania(compania).schema);
}

/** Softland, esquema dbo (GESTION_LISTAS_PRECIOS, compartida por las empresas). */
export function softlandDbo(): SoftlandClient {
  return cliente(SoftlandClient, process.env.SOFTLAND_DB_NAME ?? "SOFTLANDQA", "dbo");
}

/** Convierte Decimal/BigInt de Prisma a number para los mapeadores de dominio. */
export function plano(fila: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fila).map(([k, v]) => [k, Prisma.Decimal.isDecimal(v) ? v.toNumber() : typeof v === "bigint" ? Number(v) : v]),
  );
}
