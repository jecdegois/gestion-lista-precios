import { z } from "zod";

export const PROCESO_KEYS = [
  "FACTOR_PRECIO",
  "MAYOREOD_MASIVO",
  "DESCUENTO_LISTA_PRECIO",
  "MARGEN_UTILIDAD_MASIVO",
] as const;

export const ProcesoSchema = z.enum(PROCESO_KEYS);

/**
 * Cuerpo para enviar o guardar como borrador. La identidad y la compañia NO
 * viajan en el body: el Route Handler las toma de la sesion.
 */
export const SolicitudSchema = z.object({
  proceso: ProcesoSchema,
  modalidad: z.enum(["manual", "excel"]),
  parametros: z.record(z.string(), z.unknown()),
  filas: z.array(z.record(z.string(), z.unknown())),
  archivoNombre: z.string().nullish(),
  archivoS3Key: z.string().nullish(),
});

const TipoVariacionSchema = z.enum(["AUMENTO", "DISMINUCION"]);

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

export type SolicitudInput = z.infer<typeof SolicitudSchema>;
export type SimularManualInput = z.infer<typeof SimularManualSchema>;
export type CancelacionInput = z.infer<typeof CancelacionSchema>;
export type RechazoInput = z.infer<typeof RechazoSchema>;
export type DecisionCancelacionInput = z.infer<typeof DecisionCancelacionSchema>;
