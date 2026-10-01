import type { EstadoRedondeo } from "@/shared/utils/rounding";

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

/** Registro de Gestion Global leido desde dbo.GESTION_LISTAS_PRECIOS. */
export interface GestionGlobalLista extends NivelPrecio {
  version: string;
  variacionPorc: number | null;
  /** Moneda de la lista (GESTION_LISTAS_PRECIOS.MONEDA). */
  moneda: string | null;
  /**
   * Lista padre desde la cual se obtienen los precios base para la simulacion.
   * Corresponde a GESTION_LISTAS_PRECIOS.NIVEL_PRECIO_BASE.
   * Si es NULL en la BD, se resuelve como el codigo de la propia lista (se busca a si misma).
   */
  nivelPrecioBase: string;
  /** Moneda de la lista base (GESTION_LISTAS_PRECIOS.MONEDA_BASE). */
  monedaBase: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  factorMultiplicador: number | null;
  horasAtras: number | null;
  /** GESTION_LISTAS_PRECIOS.VALIDAR_PRECIO_BAJO_COSTO */
  validarPrecioBajoCosto: boolean;
  /** GESTION_LISTAS_PRECIOS.EXIGIR_FACTOR_CONFIGURADO */
  exigirFactorConfigurado: boolean;
  /** GESTION_LISTAS_PRECIOS.EXCEPCIONES_ARTICULOS — VARCHAR(MAX) nullable, lista de articulos */
  excepcionesArticulos: string | null;
  /** GESTION_LISTAS_PRECIOS.VALIDAR_PRECIO_BAJO_MARGEN_MIN */
  validarPrecioBajoMargenMin: boolean;
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
