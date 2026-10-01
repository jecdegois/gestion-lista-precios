-- Logo de cada empresa, cargado desde Configuración y mostrado en el header del portal
ALTER TABLE "companies" ADD COLUMN "logo" BYTEA;
ALTER TABLE "companies" ADD COLUMN "logo_mime_type" TEXT;
ALTER TABLE "companies" ADD COLUMN "logo_updated_at" TIMESTAMPTZ(6);
