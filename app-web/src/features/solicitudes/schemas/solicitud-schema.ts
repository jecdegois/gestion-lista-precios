import { z } from "zod";

export const PROCESO_KEYS = [
  "FACTOR_PRECIO",
  "MAYOREOD_MASIVO",
  "DESCUENTO_LISTA_PRECIO",
  "MARGEN_UTILIDAD_MASIVO",
] as const;

export const ProcesoSchema = z.enum(PROCESO_KEYS);

const TipoVariacionSchema = z.enum(["AUMENTO", "DISMINUCION"]);

/**
 * Solo los datos capturados de cada fila. El resto (validacion, precios,
 * descripcion) se descarta: el servidor recalcula la fila con el motor.
 */
export const FilaEntradaSchema = z.object({
  fila: z.number().int().optional(),
  codigo: z.string(),
  listaCodigo: z.string().nullish(),
  tipoVariacion: TipoVariacionSchema.optional(),
  variacionPorcentaje: z.union([z.string(), z.number()]).nullish(),
  valorPropuestoRaw: z.string().nullish(),
  porcentajeReduccion: z.union([z.string(), z.number()]).nullish(),
});

/**
 * Cuerpo para enviar o guardar como borrador. La identidad y la compañia NO
 * viajan en el body: el Route Handler las toma de la sesion.
 * `borradorId` indica que se envía/actualiza un borrador existente.
 */
export const SolicitudSchema = z.object({
  proceso: ProcesoSchema,
  modalidad: z.enum(["manual", "excel"]),
  parametros: z.object({
    nivel: z.string().nullish(),
    nivelPrecio: z.string().optional(),
    listaBase: z.string().optional(),
    factor: z.string().nullish(),
    multiplicador: z.number().nullish(),
    tipoVariacion: TipoVariacionSchema.optional(),
    variacionPorcentaje: z.union([z.string(), z.number()]).nullish(),
  }),
  filas: z.array(FilaEntradaSchema),
  archivoNombre: z.string().nullish(),
  archivoS3Key: z.string().nullish(),
  borradorId: z.string().trim().min(1).nullish(),
});

/** Simulacion manual (previsualizacion); la compañia sale de la sesion. */
export const SimularManualSchema = z.object({
  proceso: ProcesoSchema,
  nivel: z.string().optional(),
  nivelBase: z.string().optional(),
  factor: z.string().optional(),
  tipoVariacion: TipoVariacionSchema.optional(),
  grupoArticulos: z.string().optional(),
  criteriosArticulo: z.record(z.string(), z.string().optional()).optional(),
  codigosArticulos: z.array(z.string()).optional(),
  items: z
    .array(
      z.object({
        codigo: z.string(),
        listaCodigo: z.string(),
        tipoVariacion: TipoVariacionSchema,
        variacionPorcentaje: z.string(),
      }),
    )
    .optional(),
});

export const CancelacionSchema = z.object({
  motivo: z.string().trim().min(1, { error: "El motivo de cancelación es obligatorio." }),
});

export const RechazoSchema = z.object({
  motivo: z.string().trim().min(1, { error: "El motivo de rechazo es obligatorio." }),
});

export const DecisionCancelacionSchema = z.object({ aprobada: z.boolean() });

export type FilaEntrada = z.infer<typeof FilaEntradaSchema>;
export type SolicitudInput = z.infer<typeof SolicitudSchema>;
export type SimularManualInput = z.infer<typeof SimularManualSchema>;
export type CancelacionInput = z.infer<typeof CancelacionSchema>;
export type RechazoInput = z.infer<typeof RechazoSchema>;
export type DecisionCancelacionInput = z.infer<typeof DecisionCancelacionSchema>;
