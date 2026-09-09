import "server-only";
import type { CompaniaInfo } from "@/lib/types";

/**
 * Configuracion multiempresa (arquitectura multibase de datos Softland).
 * Se lee de la variable de entorno COMPANIES_CONFIG (JSON). Nunca se codifica
 * una compania fija ni credenciales en el codigo.
 *
 * Ademas de la CONEXION, cada compania puede mapear sus OBJETOS SQL: nombre y
 * esquema del SP de margen, del SP de gestion de listas y de la UDF
 * U_FACTOR_REDUCCION_MARGEN, junto con los nombres de columnas/parametros. Asi,
 * si una compania nombra distinto sus objetos o columnas, solo cambia la
 * configuracion; el codigo de la aplicacion no se toca.
 */

/** Nombres de objetos SQL configurables por compania (con defaults). */
export interface SqlObjetos {
  // SP que calcula/persiste el margen minimo (Regla de Mayoreo).
  spMargen: string;
  // SP de gestion de listas con redondeo (procesos de precio).
  spGestionListas: string;
  // Tabla/UDF de excepciones de factor de reduccion.
  udfFactorReduccion: string;
  // Tablas base para lecturas de catalogo.
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
  server: string;
  database: string;
  schema: string; // esquema OPERATIVO de la empresa (COFER, EMP1, …)
  user: string;
  password: string;
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
  server: string;
  database: string;
  schema?: string;
  user: string;
  password: string;
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
          server: cfg.server,
          database: cfg.database,
          schema: cfg.schema ?? codigo.toUpperCase(),
          user: cfg.user,
          password: cfg.password,
          sql: { ...defaultsSql(), ...(cfg.sql ?? {}) },
        };
      }
    } catch (err) {
      console.error("COMPANIES_CONFIG invalido; no es JSON valido.", err);
    }
  }
  if (Object.keys(result).length === 0) {
    result.COFER = {
      codigo: "COFER",
      label: "COFERSA",
      server: "localhost",
      database: "SOFTLAND_COFER",
      schema: "COFER",
      user: "app_user",
      password: "",
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
  return (process.env.DEMO_MODE ?? "true").toLowerCase() === "true";
}
