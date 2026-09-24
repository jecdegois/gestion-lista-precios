import type { Solicitud, TipoVariacion } from "@/lib/domain-types";
import type { UploadedFile } from "../types";

export function firstText(...values: unknown[]): string {
  const value = values.find((item) => item != null && String(item).trim() !== "");
  return value == null ? "" : String(value);
}

function percentFromMultiplier(multiplier: unknown, type: TipoVariacion): string {
  const value = Number(multiplier);
  if (!Number.isFinite(value)) return "";
  const percent = (type === "DISMINUCION" ? 1 - value : value - 1) * 100;
  return Number.isFinite(percent) ? String(Number(percent.toFixed(4))) : "";
}

/** Nivel y variación % con que se hidrata el formulario al retomar un borrador. */
export function draftValues(draft: Solicitud | undefined, type: TipoVariacion) {
  const p = draft?.parametros;
  return {
    level: firstText(p?.nivelPrecio, p?.listaBase, p?.nivel, draft?.lista),
    factor: firstText(p?.factor, p?.variacionPorcentaje) || percentFromMultiplier(p?.multiplicador, type),
  };
}

/** Archivo de plantilla guardado en el borrador, si lo hay. */
export function draftFile(draft: Solicitud | undefined): UploadedFile {
  return { name: draft?.archivoNombre ?? null, s3Key: draft?.archivoS3Key ?? null };
}

export const EMPTY_FILE: UploadedFile = { name: null, s3Key: null };
