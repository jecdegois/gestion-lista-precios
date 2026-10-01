-- El logo pasa de BYTEA en Postgres a un archivo en el almacenamiento de subidas; aquí queda solo su clave
ALTER TABLE "companies" ADD COLUMN "logo_key" TEXT;
ALTER TABLE "companies" DROP COLUMN "logo";
