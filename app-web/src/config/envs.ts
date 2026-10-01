import "server-only";
import { get } from "env-var";

// Next.js ya carga el .env; no hace falta dotenv.
const APP_ENV = get("APP_ENV").required().asEnum(["qa", "prod"]);

export const envs = {
  NODE_ENV: get("NODE_ENV").default("development").asEnum(["development", "production", "test"]),
  APP_ENV,
  DATABASE_URL: get("DATABASE_URL").required().asString(),

  // SQL Server (PORTAL_PRECIOS y Softland, mismo servidor y login).
  SOFTLAND_DB_NAME: APP_ENV === "prod" ? "SOFTLANDPRD" : "SOFTLANDQA",
  PORTAL_DB_NAME: get("PORTAL_DB_NAME").default("PORTAL_PRECIOS").asString(),
  PORTAL_DB_SERVER: get("PORTAL_DB_SERVER").required().asString(),
  PORTAL_DB_USER: get("PORTAL_DB_USER").required().asString(),
  PORTAL_DB_PASSWORD: get("PORTAL_DB_PASSWORD").required().asString(),
  SQL_PORT: get("SQL_PORT").default("1433").asPortNumber(),
  SQL_ENCRYPT: get("SQL_ENCRYPT").default("false").asBool(),
  SQL_TRUST_SERVER_CERTIFICATE: get("SQL_TRUST_SERVER_CERTIFICATE").default("true").asBool(),

  DEMO_MODE: get("DEMO_MODE").default("false").asBool(),
  // Por defecto en modo seguro: solo lectura y sin ejecución en Softland.
  READ_ONLY_MODE: get("READ_ONLY_MODE").default("true").asBool(),
  SOFTLAND_EXECUTION_BLOCKED: get("SOFTLAND_EXECUTION_BLOCKED").default("true").asBool(),
  PORTAL_ONLY_MODE: get("PORTAL_ONLY_MODE").default("false").asBool(),
};
