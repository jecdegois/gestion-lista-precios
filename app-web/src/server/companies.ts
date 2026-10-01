import "server-only";
import { envs } from "@/config/envs";
import { prisma } from "@/server/prisma";
import type { CompaniaInfo } from "@/shared/types/models";

/**
 * Configuración lógica de compañías sobre una base SQL Server compartida.
 * Las compañías se gestionan en Postgres (`companies`, módulo Configuración): su
 * `sql_schema` define el esquema en Softland y en PORTAL_PRECIOS. La conexión
 * única se toma de las variables PORTAL_DB_*.
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
  tablaGestionListaPrecio: string;
  tablaFactorArticuloLista: string;
  tablaArticuloPrecio: string;
  tablaArticulo: string;
  tablaClasificacion: string;
  // Columnas de la UDF (por si difieren entre companias).
  colUdfCodigo: string;
  colUdfDescripcion: string;
  colUdfFactor: string;
  colUdfActivo: string;
  colUdfArticulo: string;
  // Parametros nombrados del SP de margen.
  paramNivelPrecio: string;
  paramNivelPrecioBase: string;
  paramVersion: string;
  paramFactorReduccionGeneral: string;
  paramBatchSize: string;
  paramUsuario: string;
}

export interface CompaniaConfig {
  codigo: string;
  label: string;
  schema: string; // esquema operativo de la empresa (FEBECA, COFER, …)
  sql: SqlObjetos;
}

/**
 * Objeto del portal en el esquema de la empresa dentro de la base PORTAL_PRECIOS,
 * p. ej. [FEBECA].[SOLICITUD]. Cada empresa tiene sus propias tablas y secuencia.
 */
export function objetoPortal(compania: string, nombre: string): string {
  return `[${resolverCompania(compania).schema}].[${nombre}]`;
}

/** Defaults de objetos SQL (coinciden con los scripts de backend/sql). */
function defaultsSql(): SqlObjetos {
  return {
    spMargen: "SP_CALCULAR_MARGEN_MINIMO",
    spGestionListas: "SP_GESTION_LISTAS_PRECIOS_CON_REDONDEO",
    udfFactorReduccion: "U_FACTOR_REDUCCION",
    tablaNivelPrecio: "NIVEL_PRECIO",
    tablaVersionNivel: "VERSION_NIVEL",
    tablaGestionListaPrecio: "GESTION_LISTAS_PRECIOS",
    tablaFactorArticuloLista: "U_FACTOR_ARTICULO",
    tablaArticuloPrecio: "ARTICULO_PRECIO",
    tablaArticulo: "ARTICULO",
    tablaClasificacion: "CLASIFICACION",
    colUdfCodigo: "U_CODIGO",
    colUdfDescripcion: "U_DESCRIP",
    colUdfFactor: "U_FACTOR_REDUCCION",
    colUdfActivo: "U_ACTIVO",
    colUdfArticulo: "U_ARTICULO",
    paramNivelPrecio: "p_nivel_precio",
    paramNivelPrecioBase: "p_nivel_precio_base",
    paramVersion: "p_version",
    paramFactorReduccionGeneral: "p_factor_reduccion_general",
    paramBatchSize: "p_batch_size",
    paramUsuario: "p_usuario_ult_modif",
  };
}

/** Caché de compañías activas; se refresca cada TTL_MS para ver cambios hechos en otras instancias. */
const TTL_MS = 60_000;
let cache: Record<string, CompaniaConfig> = {};
let cargadoEn = 0;
let cargando: Promise<void> | null = null;

/**
 * Carga (o refresca) las compañías activas desde Postgres. Las funciones síncronas de
 * este módulo leen el caché: `getSessionContext` lo garantiza cargado en cada request.
 */
export async function cargarCompanias(force = false): Promise<void> {
  if (!force && Date.now() - cargadoEn < TTL_MS) return;
  if (!force && cargando) return cargando;
  cargando = (async () => {
    const result: Record<string, CompaniaConfig> = {};
    const rows = await prisma.company.findMany({ where: { isActive: true }, select: { code: true, name: true, sqlSchema: true } });
    for (const row of rows) {
      const codigo = row.code.toUpperCase();
      result[codigo] = { codigo, label: row.name, schema: row.sqlSchema.toUpperCase(), sql: defaultsSql() };
    }
    if (Object.keys(result).length === 0 && esModoDemo()) {
      result.COFER = { codigo: "COFER", label: "COFERSA", schema: "COFER", sql: defaultsSql() };
    }
    cache = result;
    cargadoEn = Date.now();
  })().finally(() => {
    cargando = null;
  });
  return cargando;
}

export function listarCompanias(): CompaniaInfo[] {
  return Object.values(cache).map((c) => ({ codigo: c.codigo, label: c.label }));
}

export function resolverCompania(codigo: string | null | undefined): CompaniaConfig {
  const clave = (codigo ?? "").trim().toUpperCase();
  if (!clave) {
    throw new Error("La solicitud no indica la compania activa.");
  }
  const cfg = cache[clave];
  if (!cfg) {
    throw new Error(`La compañía '${codigo}' no existe o está inactiva en Configuración.`);
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
  return envs.DEMO_MODE;
}

/**
 * Bloqueo de seguridad para pruebas contra datos reales. El valor por defecto
 * es solo lectura para evitar escrituras accidentales si falta la variable.
 */
export function esModoSoloLectura(): boolean {
  return envs.READ_ONLY_MODE;
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
  return envs.SOFTLAND_EXECUTION_BLOCKED;
}

export function esModoSoloPortal(): boolean {
  return esEjecucionSoftlandBloqueada() || envs.PORTAL_ONLY_MODE;
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
