/** Color de énfasis por defecto (el zinc-900 que el portal usaba fijo). */
export const DEFAULT_BRAND_COLOR = "#18181B";

/** Texto legible sobre el color de marca: oscuro en fondos claros, blanco en fondos oscuros. */
export function brandForeground(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? "#18181B" : "#FFFFFF";
}

/** Variables CSS que tematizan los acentos del portal (ver `--accent` en globals.css). */
export function brandStyle(hex = DEFAULT_BRAND_COLOR) {
  return { "--accent": hex, "--accent-fg": brandForeground(hex) } as React.CSSProperties;
}
