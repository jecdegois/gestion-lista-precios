import type { Solicitud } from "@/lib/domain-types";

/** Props comunes a los formularios de cada pestaña de Nueva Solicitud. */
export interface ProcessFormProps {
  readOnly: boolean;
  consultOnly: boolean;
  draft?: Solicitud;
  onSubmitted: () => void;
  onDiscardDraft: () => void;
}

export type EntryMode = "manual" | "excel";

/** Estado de guardado/envío que muestran los botones de acción. */
export type SubmissionState = { sending: boolean; savingDraft: boolean; sent: boolean };

/** Archivo de plantilla cargado (nombre original y clave en S3). */
export type UploadedFile = { name: string | null; s3Key: string | null };
