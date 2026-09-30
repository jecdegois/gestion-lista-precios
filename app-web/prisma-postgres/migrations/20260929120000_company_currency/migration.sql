-- Moneda de cada empresa (símbolo mostrado junto a los montos)
ALTER TABLE "companies" ADD COLUMN "currency_symbol" TEXT NOT NULL DEFAULT '';

UPDATE "companies" SET "currency_symbol" = 'Bs.' WHERE "code" IN ('FEBECA', 'BEVAL', 'SILLACA');
UPDATE "companies" SET "currency_symbol" = '₡' WHERE "code" IN ('COFER', 'COFERSA');
