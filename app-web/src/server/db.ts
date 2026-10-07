import "server-only";
import type { ConnectionPool as MssqlConnectionPool } from "mssql";
import { PrismaClient as SoftlandClient } from "@/generated/softland";
import { Prisma, PrismaClient as PortalClient } from "@/generated/sqlserver";
import { envs } from "@/config/envs";
import { resolverCompania } from "./companies";

/**
 * Bases SQL Server:
 * - PORTAL_DB_NAME (PORTAL_PRECIOS): estado del portal, un esquema por empresa (Prisma, ver portalDb).
 * - Softland de Venezuela (SOFTLANDQA o SOFTLANDPRD según APP_ENV): mismo servidor y login (PORTAL_DB_*).
 * - Softland de Costa Rica (MARQA o MAR): otro servidor y login (SOFTLAND_CR_*), para compañías con país CR.
 */
type SqlTarget = { server: string; user: string; password: string; database: string };

const PORTAL: SqlTarget = {
  server: envs.PORTAL_DB_SERVER,
  user: envs.PORTAL_DB_USER,
  password: envs.PORTAL_DB_PASSWORD,
  database: envs.PORTAL_DB_NAME,
};
const SOFTLAND_VE: SqlTarget = { ...PORTAL, database: envs.SOFTLAND_DB_NAME };
const SOFTLAND_CR: SqlTarget | null =
  envs.SOFTLAND_CR_SERVER && envs.SOFTLAND_CR_USER && envs.SOFTLAND_CR_PASSWORD
    ? { server: envs.SOFTLAND_CR_SERVER, user: envs.SOFTLAND_CR_USER, password: envs.SOFTLAND_CR_PASSWORD, database: envs.SOFTLAND_CR_DB_NAME }
    : null;

const esCostaRica = (country: string) => country.toUpperCase() === "CR";

/** Instancia de Softland de la compañía según su país. */
function softlandDe(compania: string): SqlTarget {
  if (!esCostaRica(resolverCompania(compania).country)) return SOFTLAND_VE;
  if (!SOFTLAND_CR) throw new Error("Faltan SOFTLAND_CR_SERVER/USER/PASSWORD para las compañías de Costa Rica.");
  return SOFTLAND_CR;
}

const pools = new Map<string, Promise<MssqlConnectionPool>>();

function buildSqlConfig(target: SqlTarget) {
  return {
    ...target,
    port: envs.SQL_PORT,
    options: {
      encrypt: envs.SQL_ENCRYPT,
      trustServerCertificate: envs.SQL_TRUST_SERVER_CERTIFICATE,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  };
}

async function poolFor(target: SqlTarget): Promise<MssqlConnectionPool> {
  const key = `${target.server}/${target.database}`;
  const existing = await pools.get(key)?.catch(() => null);
  if (existing?.connected) return existing;
  const connecting = import("mssql").then((mssql) => new mssql.ConnectionPool(buildSqlConfig(target)).connect());
  pools.set(key, connecting);
  connecting.catch(() => pools.delete(key));
  return connecting;
}

/** Pool de Softland para los catálogos de una compañía (valida que la compañía exista). */
export async function getPool(compania: string): Promise<MssqlConnectionPool> {
  return poolFor(softlandDe(compania));
}

async function leerEsquemas(target: SqlTarget): Promise<Set<string>> {
  const { recordset } = await (await poolFor(target)).request().query<{ name: string }>("SELECT name FROM sys.schemas");
  return new Set(recordset.map((r) => r.name.toUpperCase()));
}

/** Esquemas que existen en el portal y en el Softland de cada país (diagnóstico de Configuración). */
export async function esquemasExistentes(): Promise<{ portal: Set<string>; enSoftland: (country: string, schema: string) => boolean }> {
  const [portal, ve, cr] = await Promise.all([
    leerEsquemas(PORTAL),
    leerEsquemas(SOFTLAND_VE),
    // Si Costa Rica no responde se sigue verificando Venezuela; sus compañías quedan como sin esquema.
    SOFTLAND_CR
      ? leerEsquemas(SOFTLAND_CR).catch((error) => {
          console.error("[sql] no se pudieron leer los esquemas del Softland de Costa Rica:", error);
          return new Set<string>();
        })
      : new Set<string>(),
  ]);
  return { portal, enSoftland: (country, schema) => (esCostaRica(country) ? cr : ve).has(schema.toUpperCase()) };
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

/** URL de Prisma (SQL Server). SQL Server no tiene search_path: el esquema va en `schema`. */
function urlSqlServer({ server, user, password, database }: SqlTarget, schema: string): string {
  return (
    `sqlserver://${server}:${envs.SQL_PORT};` +
    `database=${database};user=${user};` +
    `password={${password}};encrypt=${envs.SQL_ENCRYPT};` +
    `trustServerCertificate=${envs.SQL_TRUST_SERVER_CERTIFICATE};schema=${schema}`
  );
}

/**
 * Clientes Prisma cacheados por base+esquema (sobreviven al hot reload).
 * Ojo: el SQL crudo ($queryRaw) NO usa el esquema de la URL; ahí calificar con objetoPortal()/objetoCalificado().
 */
const globalClients = globalThis as unknown as { prismaSqlServer?: Map<string, PortalClient | SoftlandClient> };
const clients = (globalClients.prismaSqlServer ??= new Map());

function cliente<T extends PortalClient | SoftlandClient>(Client: new (o: { datasourceUrl: string }) => T, target: SqlTarget, schema: string): T {
  const key = `${target.server}/${target.database}.${schema}`;
  let c = clients.get(key) as T | undefined;
  if (!c) {
    c = new Client({ datasourceUrl: urlSqlServer(target, schema) });
    clients.set(key, c);
  }
  return c;
}

/** BD del portal (PORTAL_PRECIOS), esquema de la compañía. */
export function portalDb(compania: string): PortalClient {
  return cliente(PortalClient, PORTAL, resolverCompania(compania).schema);
}

/** Softland del país de la compañía, en su esquema (NIVEL_PRECIO, VERSION_NIVEL). */
export function softlandDb(compania: string): SoftlandClient {
  return cliente(SoftlandClient, softlandDe(compania), resolverCompania(compania).schema);
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
