-- Empresa activa elegida por el usuario en el selector del header (NULL = primera asignada)
ALTER TABLE "sessions" ADD COLUMN "active_company" TEXT;
