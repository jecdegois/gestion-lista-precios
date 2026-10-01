import "server-only";
import type { ConnectionPool as MssqlConnectionPool } from "mssql";
import { PrismaClient as SoftlandClient } from "@/generated/softland";
import { Prisma, PrismaClient as PortalClient } from "@/generated/sqlserver";
import { envs } from "@/config/envs";
import { resolverCompania } from "./companies";

/**
 * Dos bases en el mismo servidor y con el mismo login (PORTAL_DB_*):
 * - PORTAL_DB_NAME (PORTAL_PRECIOS): estado del portal, un esquema por empresa (Prisma, ver portalDb).
 * - Softland (SOFTLANDQA o SOFTLANDPRD según APP_ENV): catálogos de Softland, solo lectura (mssql).
 */
const SOFTLAND_DB = envs.SOFTLAND_DB_NAME;
const PORTAL_DB = envs.PORTAL_DB_NAME;

const pools = new Map<string, Promise<MssqlConnectionPool>>();

function buildSqlConfig(database: string) {
  return {
    server: envs.PORTAL_DB_SERVER,
    database,
    user: envs.PORTAL_DB_USER,
    password: envs.PORTAL_DB_PASSWORD,
    port: envs.SQL_PORT,
    options: {
      encrypt: envs.SQL_ENCRYPT,
      trustServerCertificate: envs.SQL_TRUST_SERVER_CERTIFICATE,
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
  return poolFor(SOFTLAND_DB);
}

async function leerEsquemas(database: string): Promise<Set<string>> {
  const { recordset } = await (await poolFor(database)).request().query<{ name: string }>("SELECT name FROM sys.schemas");
  return new Set(recordset.map((r) => r.name.toUpperCase()));
}

/** Esquemas que existen en la BD de Softland y en la del portal (diagnóstico de Configuración). */
export async function esquemasExistentes(): Promise<{ softland: Set<string>; portal: Set<string> }> {
  const [softland, portal] = await Promise.all([
    leerEsquemas(SOFTLAND_DB),
    leerEsquemas(PORTAL_DB),
  ]);
  return { softland, portal };
}

/** Igual que esquemasExistentes, cacheado 1 min (se consulta en cada request de sesión). */
let esquemasCache: { en: number; esquemas: ReturnType<typeof esquemasExistentes> } | undefined;
export function esquemasExistentesCache(): ReturnType<typeof esquemasExistentes> {
  if (!esquemasCache || Date.now() - esquemasCache.en > 60_000) {
    const esquemas = esquemasExistentes();
    esquemas.catch(() => (esquemasCache = undefined));
    esquemasCache = { en: Date.now(), esquemas };
  }
  return esquemasCache.esquemas;
}

/** Devuelve el esquema calificado de la compania (p. ej. "[FEBECA]"). */
export function esquemaDe(compania: string): string {
  return `[${resolverCompania(compania).schema}]`;
}

/** URL de Prisma (SQL Server) con el login PORTAL_DB_*. SQL Server no tiene search_path: el esquema va en `schema`. */
function urlSqlServer(database: string, schema: string): string {
  const e = envs;
  return (
    `sqlserver://${e.PORTAL_DB_SERVER}:${e.SQL_PORT};` +
    `database=${database};user=${e.PORTAL_DB_USER};` +
    `password={${e.PORTAL_DB_PASSWORD}};encrypt=${e.SQL_ENCRYPT};` +
    `trustServerCertificate=${e.SQL_TRUST_SERVER_CERTIFICATE};schema=${schema}`
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
  return cliente(PortalClient, PORTAL_DB, resolverCompania(compania).schema);
}

/** Softland, esquema de la compañía (NIVEL_PRECIO, VERSION_NIVEL). */
export function softlandDb(compania: string): SoftlandClient {
  return cliente(SoftlandClient, SOFTLAND_DB, resolverCompania(compania).schema);
}

/** Softland, esquema dbo (GESTION_LISTAS_PRECIOS, compartida por las empresas). */
export function softlandDbo(): SoftlandClient {
  return cliente(SoftlandClient, SOFTLAND_DB, "dbo");
}

/**
 * "Ahora" en la hora local del SQL Server (equivale a GETDATE()). Prisma escribe los Date como UTC
 * y la BD guarda hora local, así que se desplaza por el desfase real del servidor.
 */
let desfaseMin: Promise<number> | undefined;
export async function ahoraServidor(db: PortalClient): Promise<Date> {
  // ponytail: desfase cacheado por proceso; si el servidor cambiara de huso (sin DST en VE), reiniciar la app.
  desfaseMin ??= db.$queryRaw<{ m: number }[]>`SELECT DATEDIFF(minute, GETUTCDATE(), GETDATE()) AS m`
    .then((r) => r[0].m)
    .catch((err) => {
      desfaseMin = undefined;
      throw err;
    });
  return new Date(Date.now() + (await desfaseMin) * 60_000);
}

/** Convierte Decimal/BigInt de Prisma a number para los mapeadores de dominio. */
export function plano(fila: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fila).map(([k, v]) => [k, Prisma.Decimal.isDecimal(v) ? v.toNumber() : typeof v === "bigint" ? Number(v) : v]),
  );
}
