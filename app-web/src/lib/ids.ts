/** Generadores de identificadores portados del mockup. */

export function nuevoIdSolicitud(seq: number): string {
  return "SOL-" + (10450 + seq);
}

export function nuevoIdProcesoSP(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 8999);
  return "#PROC-" + yyyy + mm + dd + "-" + rand;
}

export function nombreArchivoS3(prefijo: string, ext: string): string {
  const d = new Date();
  const ts = d.toISOString().replace(/[-:T.]/g, "").slice(0, 14);
  return prefijo + "-" + ts + "." + ext;
}

export function ahoraCR(): string {
  return new Date().toLocaleString("es-CR", { hour12: false });
}
