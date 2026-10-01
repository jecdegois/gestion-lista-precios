import { z } from "zod";

/** Identificador SQL seguro: se interpola entre corchetes en las consultas a SQL Server. */
const sqlIdentifier = (label: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,29}$/, {
      error: `${label}: de 2 a 30 caracteres, empieza con letra y solo admite letras, números y _`,
    });

/** Datos editables: nombre, esquema SQL, país ISO alfa-2 (o vacío), moneda y color #RRGGBB. */
export const UpdateCompanySchema = z.object({
  name: z.string().trim().min(1, { error: "El nombre es obligatorio" }).max(100),
  sqlSchema: sqlIdentifier("El esquema SQL"),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z]{2})?$/, { error: "El país debe ser un código de 2 letras (p. ej. VE)" }),
  currencySymbol: z
    .string()
    .trim()
    .min(1, { error: "La moneda es obligatoria" })
    .max(5, { error: "La moneda admite hasta 5 caracteres (p. ej. Bs.)" }),
  brandColor: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^#[0-9A-F]{6}$/, { error: "El color debe tener el formato #RRGGBB" }),
});

/** Alta de compañía: el código (inmutable después) más los datos editables. */
export const CreateCompanySchema = UpdateCompanySchema.extend({
  code: sqlIdentifier("El código"),
});

/** Formulario de compañía: el esquema SQL toma el código cuando se deja vacío. */
export const CompanyFormSchema = z.preprocess(
  (data: CreateCompanyInput) => ({ ...data, sqlSchema: data.sqlSchema.trim() || data.code }),
  CreateCompanySchema,
);

export type UpdateCompanyInput = z.infer<typeof UpdateCompanySchema>;
export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;
