import "server-only";
import type { CompaniaInfo } from "@/lib/types";

/**
 * Configuración lógica de compañías sobre una base SQL Server compartida.
 * Se lee de COMPANIES_CONFIG y únicamente define esquema y nombres de objetos;
 * la conexión única se toma de las variables PORTAL_DB_*.
 */

/** Nombres de objetos SQL configurables por compania (con defaults). */
export interface SqlObjetos {
  // SP que calcula/persiste el margen minimo (Regla de Mayoreo).
  spMargen: string;
  // SP de gestion de listas con redondeo (procesos de precio).
  spGestionListas: string;
  // Tabla/UDF de excepciones de factor de reduccion.
  udfFactorReduccion: string;
  // Tablas maestras de Softland para listas y artículos.
  tablaNivelPrecio: string;
  tablaVersionNivel: string;
  tablaArticuloPrecio: string;
  tablaArticulo: string;
  // Columnas de la UDF (por si difieren entre companias).
  colUdfCodigo: string;
  colUdfDescripcion: string;
  colUdfFactor: string;
  colUdfActivo: string;
  // Parametros nombrados del SP de margen.
  paramNivelPrecio: string;
  paramVersion: string;
  paramArticulo: string;
  paramUsuario: string;
}

export interface CompaniaConfig {
  codigo: string;
  label: string;
  schema: string; // esquema operativo de la empresa (FEBECA, COFER, …)
  sql: SqlObjetos;
}

/**
 * Esquema del PORTAL (estado de la app: usuarios, solicitudes, auditoría).
 * Es fijo para toda la organización y NO depende de la compañía activa.
 * Configurable con PORTAL_SCHEMA (default PORTAL_PRECIOS).
 */
export function esquemaPortal(): string {
  return process.env.PORTAL_SCHEMA?.trim() || "PORTAL_PRECIOS";
}

/** Objeto del portal calificado: [PORTAL_PRECIOS].[NOMBRE]. */
export function objetoPortal(nombre: string): string {
  return `[${esquemaPortal()}].[${nombre}]`;
}

/** Defaults de objetos SQL (coinciden con los scripts de backend/sql). */
function defaultsSql(): SqlObjetos {
  return {
    spMargen: "SP_CALCULAR_MARGEN_MINIMO_ARTICULO",
    spGestionListas: "SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO",
    udfFactorReduccion: "U_FACTOR_REDUCCION_MARGEN",
    tablaNivelPrecio: "NIVEL_PRECIO",
    tablaVersionNivel: "VERSION_NIVEL",
    tablaArticuloPrecio: "ARTICULO_PRECIO",
    tablaArticulo: "ARTICULO",
    colUdfCodigo: "U_CODIGO",
    colUdfDescripcion: "U_DESCRIP",
    colUdfFactor: "U_FACTOR_REDUCCION",
    colUdfActivo: "U_ACTIVO",
    paramNivelPrecio: "p_nivel_precio",
    paramVersion: "p_version",
    paramArticulo: "p_articulo",
    paramUsuario: "p_usuario_ult_modif",
  };
}

type CompaniaConfigRaw = {
  label?: string;
  schema?: string;
  sql?: Partial<SqlObjetos>;
};

let cache: Record<string, CompaniaConfig> | null = null;

function parseConfig(): Record<string, CompaniaConfig> {
  if (cache) return cache;
  const raw = process.env.COMPANIES_CONFIG;
  const result: Record<string, CompaniaConfig> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, CompaniaConfigRaw>;
      for (const [codigo, cfg] of Object.entries(parsed)) {
        result[codigo.toUpperCase()] = {
          codigo: codigo.toUpperCase(),
          label: cfg.label ?? codigo,
          schema: cfg.schema ?? codigo.toUpperCase(),
          sql: { ...defaultsSql(), ...(cfg.sql ?? {}) },
        };
      }
    } catch (err) {
      console.error("COMPANIES_CONFIG invalido; no es JSON valido.", err);
    }
  }
  if (Object.keys(result).length === 0 && esModoDemo()) {
    result.COFER = {
      codigo: "COFER",
      label: "COFERSA",
      schema: "COFER",
      sql: defaultsSql(),
    };
  }
  cache = result;
  return result;
}

export function listarCompanias(): CompaniaInfo[] {
  return Object.values(parseConfig()).map((c) => ({ codigo: c.codigo, label: c.label }));
}

export function resolverCompania(codigo: string | null | undefined): CompaniaConfig {
  const clave = (codigo ?? "").trim().toUpperCase();
  if (!clave) {
    throw new Error("La solicitud no indica la compania activa.");
  }
  const cfg = parseConfig()[clave];
  if (!cfg) {
    throw new Error(`No hay base de datos Softland configurada para la compania '${codigo}'.`);
  }
  return cfg;
}

/** Objeto SQL calificado con el esquema de la compania, p.ej. [COFER].[SP_...]. */
export function objetoCalificado(compania: string, objeto: keyof SqlObjetos): string {
  const cfg = resolverCompania(compania);
  return `[${cfg.schema}].[${cfg.sql[objeto]}]`;
}

/** Nombre de columna/parametro configurado para la compania. */
export function nombreSql(compania: string, clave: keyof SqlObjetos): string {
  return resolverCompania(compania).sql[clave];
}

export function esModoDemo(): boolean {
  return (process.env.DEMO_MODE ?? "false").trim().toLowerCase() === "true";
}

/**
 * Bloqueo de seguridad para pruebas contra datos reales. El valor por defecto
 * es solo lectura para evitar escrituras accidentales si falta la variable.
 */
export function esModoSoloLectura(): boolean {
  return (process.env.READ_ONLY_MODE ?? "true").trim().toLowerCase() === "true";
}

/**
 * Guardia de aplicación para este entorno de análisis y simulación.
 * Permanece activa salvo una habilitación explícita futura, auditada y fuera
 * de este código. Con ella activa nunca se ejecutan MERGE, INSERT, UPDATE ni
 * procedimientos almacenados, ni operaciones `INSERT`, `UPDATE`, `DELETE`,
 * `MERGE` o `ALTER` sobre los esquemas operativos de Softland. Las consultas
 * `SELECT` de catálogos permanecen habilitadas.
 */
export function esEjecucionSoftlandBloqueada(): boolean {
  return true;
}

export function esModoSoloPortal(): boolean {
  return esEjecucionSoftlandBloqueada()
    || (process.env.PORTAL_ONLY_MODE ?? "false").trim().toLowerCase() === "true";
}

export function assertEscrituraPortalHabilitada(): void {
  if (esModoSoloLectura()) {
    throw new Error("PORTAL_READ_ONLY: el sistema está configurado únicamente para lectura.");
  }
}

export function assertEscrituraSoftlandHabilitada(): void {
  if (esEjecucionSoftlandBloqueada()) {
    throw new Error("SOFTLAND_EXECUTION_BLOCKED: este aplicativo opera solo en simulación; no se permiten mutaciones ni procedimientos almacenados de Softland.");
  }
  if (esModoSoloLectura()) {
    throw new Error("SOFTLAND_READ_ONLY: Softland está configurado únicamente para lectura.");
  }
  if (esModoSoloPortal()) {
    throw new Error("PORTAL_ONLY_MODE: las mutaciones y procedimientos de Softland están bloqueados.");
  }
}

/** @deprecated Use una guarda específica para Portal o Softland. */
export function assertEscrituraHabilitada(): void {
  assertEscrituraSoftlandHabilitada();
}
