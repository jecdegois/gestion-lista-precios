/** Logos admitidos: sin SVG (puede llevar scripts) y con tope de tamaño porque se sirven en cada página. */
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";

/** Tipo real según la firma de los primeros bytes; no se confía en el Content-Type del cliente. */
export function detectLogoMimeType(bytes: Uint8Array): string | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** URL pública del logo; `v` cambia con cada carga para invalidar la caché. */
export function companyLogoUrl(code: string, updatedAt: Date | null): string | null {
  return updatedAt ? `/api/configuracion/companias/${encodeURIComponent(code)}/logo?v=${updatedAt.getTime()}` : null;
}
