import "server-only";
import type { ConnectionPool as MssqlConnectionPool } from "mssql";
import { resolverCompania, type CompaniaConfig } from "./companies";

/**
 * Pool de conexiones SQL Server por compania (arquitectura multiempresa).
 * Cada compania mantiene su propio pool contra su base Softland. La carga de
 * `mssql` es dinamica para no romper el build cuando el paquete no esta
 * instalado (por ejemplo, en DEMO_MODE).
 */
const pools = new Map<string, MssqlConnectionPool>();

function buildConfig(cfg: CompaniaConfig) {
  return {
    server: cfg.server,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    port: Number(process.env.SQL_PORT ?? 1433),
    options: {
      encrypt: (process.env.SQL_ENCRYPT ?? "false").toLowerCase() === "true",
      trustServerCertificate:
        (process.env.SQL_TRUST_SERVER_CERTIFICATE ?? "true").toLowerCase() === "true",
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  };
}

export async function getPool(compania: string): Promise<MssqlConnectionPool> {
  const clave = compania.trim().toUpperCase();
  const existente = pools.get(clave);
  if (existente && existente.connected) return existente;

  const cfg = resolverCompania(clave);
  // Import dinamico: solo se carga en servidor y solo cuando se conecta de verdad.
  const mssql = await import("mssql");
  const pool = new mssql.ConnectionPool(buildConfig(cfg));
  await pool.connect();
  pools.set(clave, pool);
  return pool;
}

/** Devuelve el esquema calificado de la compania (p. ej. "[COFER]"). */
export function esquemaDe(compania: string): string {
  return `[${resolverCompania(compania).schema}]`;
}

/**
 * Pool para la base del PORTAL (esquema [PORTAL_PRECIOS]). Es un unico destino
 * para toda la organizacion, independiente de la compania activa. Se configura
 * con PORTAL_DB_* ; si no se define, cae en las variables PORTAL_* mínimas.
 */
let portalPool: MssqlConnectionPool | null = null;

export async function getPortalPool(): Promise<MssqlConnectionPool> {
  if (portalPool && portalPool.connected) return portalPool;
  const mssql = await import("mssql");
  const pool = new mssql.ConnectionPool({
    server: process.env.PORTAL_DB_SERVER ?? "localhost",
    database: process.env.PORTAL_DB_NAME ?? "SOFTLANDPRD",
    user: process.env.PORTAL_DB_USER ?? "app_user",
    password: process.env.PORTAL_DB_PASSWORD ?? "",
    port: Number(process.env.SQL_PORT ?? 1433),
    options: {
      encrypt: (process.env.SQL_ENCRYPT ?? "false").toLowerCase() === "true",
      trustServerCertificate: (process.env.SQL_TRUST_SERVER_CERTIFICATE ?? "true").toLowerCase() === "true",
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  });
  await pool.connect();
  portalPool = pool;
  return pool;
}
