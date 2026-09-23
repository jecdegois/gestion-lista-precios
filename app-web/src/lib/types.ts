import type { EstadoRedondeo } from "./rounding";

/** Articulo del catalogo (precio de lista + costo para margen). */
export interface Articulo {
  codigo: string;
  descripcion: string;
  precioLista: number;
  costoPromedio: number;
  /** Porcentaje persistido en ARTICULO_PRECIO.MARGEN_UTILIDAD_MIN (ej. 20 = 20%). */
  margenUtilidadMinPorcentaje?: number | null;
  nivelPrecio?: string;
  version?: number;
  clasificacion1?: string;
  clasificacion1Descripcion?: string;
  clasificacion2?: string;
  clasificacion2Descripcion?: string;
  clasificacion3?: string;
  clasificacion3Descripcion?: string;
  clasificacion4?: string;
  clasificacion4Descripcion?: string;
  clasificacion5?: string;
  clasificacion5Descripcion?: string;
}

/** Nivel/lista de precio maestro de Softland. */
export interface NivelPrecio {
  codigo: string;
  nombre: string;
}

/** Registro de Gestión Global leído desde dbo.GESTION_LISTAS_PRECIOS. */
export interface GestionGlobalLista extends NivelPrecio {
  version: string;
  variacionPorc: number | null;
}

/** Resultado de evaluar una fila de la carga masiva de margen. */
export interface FilaMargenResultado {
  fila: number;
  codigo: string;
  descripcion: string;
  porcentajeReduccion: number | null;
  factorReduccion: number | null;
  multiplicadorMargen: number | null;
  precioLista: number | null;
  precioRedondeado: number | null;
  bandaRedondeo: { numero: number; intervalo: string } | null;
  estadoRedondeo: EstadoRedondeo | null;
  margenPromedio: number | null;
  margenSobrePrecioRedondeado: number | null;
  margenMinimo: number | null;
  costoMinimo: number | null;
  valido: boolean;
  codigoRechazo: string | null;
  causa: string | null;
}

/** Resultado del calculo por articulo individual (pestana Por Articulo). */
export interface CalculoPorArticulo {
  codigo: string;
  descripcion: string;
  precioLista: number;
  costoPromedio: number;
  porcentajeReduccion: number;
  factorReduccion: number;
  multiplicadorMargen: number;
  precioRedondeado: number | null;
  bandaRedondeo: { numero: number; intervalo: string } | null;
  estadoRedondeo: EstadoRedondeo;
  margenPromedio: number | null;
  margenSobrePrecioRedondeado: number | null;
  margenMinimo: number | null;
  valido: boolean;
  codigoRechazo: string | null;
  causa: string | null;
}

/** Compania disponible para el selector multiempresa. */
export interface CompaniaInfo {
  codigo: string;
  label: string;
}

/** Evento de auditoria del procesamiento. */
export interface EventoAuditoria {
  idProceso: string;
  compania: string;
  proceso: "CARGA_MASIVA_MARGEN" | "CALCULO_POR_ARTICULO";
  fecha: string;
  usuario: string;
  totalRegistros: number;
  exitosos: number;
  fallidos: number;
  estadoFinal: "PROCESADO" | "PROCESADO_CON_ERRORES" | "ERROR_EJECUCION";
  resumen: string;
}
