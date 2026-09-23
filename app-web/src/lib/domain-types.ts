/** Tipos de dominio portados del mockup MV26020 (paridad funcional). */

import type { EstadoRedondeo } from "./rounding";

export type Rol = "OPERADOR" | "APROBADOR" | "SIN_PERMISO";

export type RoleCode = "operator" | "approver" | "auditor";

export type UserStatusDomain = "pending" | "active" | "inactive";

export interface AuthContext {
  sessionId: string;
  expiresAt: Date;
  userId: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  companies: { company: string; role: RoleCode }[];
}

export interface Identidad {
  email: string;
  nombre: string;
  rol: Rol;
  color: string;
  compania: string | null;
  /** Subject canónico del proveedor de identidad, usado como IDP_OPERADOR. */
  idpSubject?: string | null;
}

export type ProcesoKey =
  | "FACTOR_PRECIO"
  | "MAYOREOD_MASIVO"
  | "DESCUENTO_LISTA_PRECIO"
  | "MARGEN_UTILIDAD_MASIVO";

export type ModoProceso = "factor" | "margen";

export interface ProcesoDef {
  label: string;
  desc: string;
  ejecucion: string;
  modo: ModoProceso;
}

export type TipoVariacion = "AUMENTO" | "DISMINUCION";

export interface ArticuloCatalogo {
  codigo: string;
  descripcion: string;
  precioActual: number;
  costoReposicion: number;
  margenUtilidadMin?: number;
  categoria: string;
  categoriaDescripcion?: string;
  subcategoria: string;
  subcategoriaDescripcion?: string;
  grupo: string;
  grupoDescripcion?: string;
  marca: string;
  marcaDescripcion?: string;
  marcaGrupoCompra: string;
  marcaGrupoCompraDescripcion?: string;
  bdf: string;
  bdfDescripcion?: string;
}

/** Validación de una fila de precio (modo "factor"). */
export interface ValidacionPrecio {
  valido: boolean;
  precioActual: number | null;
  precioPropuesto: number | null;
  factorPropuesto: number | null;
  multiplicador: number | null;
  factorReduccion: number | null;
  precioRedondeado: number | null;
  estadoRedondeo: EstadoRedondeo | null;
  bandaRedondeo: { numero: number; intervalo: string } | null;
  /** Factor decimal del margen mínimo de ARTICULO_PRECIO (ej. 0.20 = 20%). */
  margenMinimo: number | null;
  costoMinimo: number | null;  
  /** Costo de reposición usado para validar y persistir el detalle. */
  costo: number | null;
  /** Precio mínimo equivalente: costo / (1 - margen mínimo). */
  precioMin: number | null;
  causa: string | null;
}

/** Validación de una fila de margen (modo "margen") — shape extendido. */
export interface ValidacionMargen {
  valido: boolean;
  precioActual: number | null;
  multiplicador: number | null;
  precioPropuesto: number | null;
  factorPropuesto: number | null;
  precioRedondeado: number | null;
  estadoRedondeo: EstadoRedondeo | null;
  bandaRedondeo: { numero: number; intervalo: string } | null;
  /** Costo de reposición usado para persistir el detalle. */
  costo: number | null;
  /** Precio mínimo equivalente del margen base de ARTICULO_PRECIO. */
  costoMinimoBase: number | null;
  /** Precio mínimo equivalente después de aplicar la reducción simulada. */
  costoMinimo: number | null;
  precioMin: number | null;
  margenPromedio: number | null;
  margenSobrePrecioRedondeado: number | null;
  /** Margen base leído de ARTICULO_PRECIO o fallback global si está nulo. */
  margenMinimoBase: number | null;
  /** Margen mínimo simulado después de aplicar la reducción. */
  margenMinimo: number | null;
  porcentajeReduccion: number | null;
  factorReduccion: number | null;
  multiplicadorMargen: number | null;
  codigoRechazo: string | null;
  causa: string | null;
}

export interface FilaPrecio {
  fila: number;
  codigo: string;
  descripcion: string;
  lista?: string;
  listaCodigo?: string | null;
  tipoVariacion?: TipoVariacion;
  variacionPorcentaje?: number | string;
  valorPropuestoRaw?: string;
  precioCalculado?: number;
  grupoArticulo?: string;
  validacion: ValidacionPrecio;
  precioMin: number;
  factorPropuesto: number;
}

export interface FilaMargen {
  fila: number;
  codigo: string;
  descripcion: string;
  porcentajeReduccion: number | null;
  factorReduccion: number | null;
  multiplicadorMargen: number | null;
  validacion: ValidacionMargen;
  lista?: string;
}

export type FilaResultado = FilaPrecio | FilaMargen;

export type EstadoSolicitud =
  | "PENDIENTE"
  | "EN_PROCESO"
  | "PROCESADO"
  | "PROCESADO_CON_ERRORES"
  | "RECHAZADO"
  | "ERROR_EJECUCION";

export interface CriteriosArticulo {
  clasificacion1?: string;
  clasificacion2?: string;
  clasificacion3?: string;
  clasificacion4?: string;
  clasificacion5?: string;
}

export interface ParametrosSolicitud {
  nivel?: string | null;
  factor?: string | null;
  tipoVariacion?: TipoVariacion;
  variacionPorcentaje?: number | string | null;
  listaBase?: string;
  nivelPrecio?: string;
  grupoArticulos?: string;
  criteriosArticulo?: CriteriosArticulo;
  codigosArticulos?: string[];
  articulos?: FilaResultado[];
}

export interface ResultadoEjecucion {
  totalLote: number;
  exitosos: number;
  fallidos: number;
  filas: FilaResultado[];
  estadoFinal: EstadoSolicitud;
  logS3Key: string;
  aprobadoPor: string;
  aprobadoPorEmail: string;
}

export interface Solicitud {
  id: string;
  proceso: ProcesoKey;
  modalidad: "manual" | "excel";
  compania: string;
  lista:string;
  solicitanteNombre: string;
  solicitanteEmail: string;
  /** Identificador IdP obligatorio del usuario que crea la solicitud Portal. */
  idpOperador?: string | null;
  parametros: ParametrosSolicitud;
  filas: FilaResultado[];
  archivoNombre: string | null;
  archivoS3Key: string | null;
  fechaEnvio: string;
  estado: EstadoSolicitud;
  motivoRechazo: string | null;
  idProcesoSP: string | null;
  autorizadoPor?: string;
  autorizadoPorEmail?: string;
  ultimaActualizacion?: string;
  resultado?: ResultadoEjecucion;
}

export type EventoTipo =
  | "SOLICITUD_ENVIADA"
  | "SOLICITUD_RECHAZADA"
  | "SIMULACION_REVISADA"
  | "SIMULACION_EJECUTADA_COMO_SOLICITANTE"
  | "EJECUCION_ENCOLADA"
  | "EJECUCION_FINALIZADA";

export interface EventoAuditoria {
  id: string;
  fecha: string;
  usuario: string;
  rol: Rol;
  evento: EventoTipo;
  solicitudId: string | null;
  idProcesoSP: string | null;
  compania: string;
}

export function esFilaMargen(fila: FilaResultado): fila is FilaMargen {
  return (
    !!fila &&
    !!(fila as FilaMargen).validacion &&
    Object.prototype.hasOwnProperty.call((fila as FilaMargen).validacion, "factorReduccion")
  );
}
