import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { envs } from "@/config/envs";

/**
 * Almacenamiento de archivos subidos por los usuarios. Hoy en disco del servidor (`UPLOADS_DIR`);
 * para pasar a S3 basta con otra implementación de esta misma interfaz.
 * Las claves las genera el servidor (nunca vienen del cliente), p. ej. `company-logos/<uuid>.png`.
 */
export interface FileStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** `null` si el archivo no existe. */
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const root = path.resolve(envs.UPLOADS_DIR);

/** Ruta absoluta de la clave; rechaza cualquier clave que salga de `UPLOADS_DIR`. */
function resolveKey(key: string): string {
  const fullPath = path.resolve(root, key);
  if (!fullPath.startsWith(root + path.sep)) throw new Error(`Clave de archivo inválida: ${key}`);
  return fullPath;
}

const localStorage: FileStorage = {
  async put(key, bytes) {
    const fullPath = resolveKey(key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, bytes);
  },
  async get(key) {
    return readFile(resolveKey(key)).catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return null;
      throw err;
    });
  },
  async delete(key) {
    await rm(resolveKey(key), { force: true });
  },
};

export const fileStorage: FileStorage = localStorage;
