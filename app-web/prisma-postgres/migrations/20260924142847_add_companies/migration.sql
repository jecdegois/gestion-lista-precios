-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sql_schema" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- Registra las empresas ya asignadas para que la FK sea válida
INSERT INTO "companies" ("code", "name", "sql_schema")
SELECT DISTINCT "company", "company", "company" FROM "users_company"
ON CONFLICT ("code") DO NOTHING;

-- AddForeignKey
ALTER TABLE "users_company" ADD CONSTRAINT "users_company_company_fkey" FOREIGN KEY ("company") REFERENCES "companies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
