-- País (ISO 3166-1 alfa-2) y color de marca de cada empresa, gestionados desde Configuración
ALTER TABLE "companies" ADD COLUMN "country" TEXT NOT NULL DEFAULT '';
ALTER TABLE "companies" ADD COLUMN "brand_color" TEXT NOT NULL DEFAULT '#18181B';

UPDATE "companies" SET "country" = 'VE', "brand_color" = '#009EE0' WHERE "code" = 'FEBECA';
UPDATE "companies" SET "country" = 'VE', "brand_color" = '#CBE443' WHERE "code" = 'BEVAL';
UPDATE "companies" SET "country" = 'VE', "brand_color" = '#E4007D' WHERE "code" = 'SILLACA';
UPDATE "companies" SET "country" = 'CR', "brand_color" = '#009EE0' WHERE "code" IN ('COFER', 'COFERSA');
