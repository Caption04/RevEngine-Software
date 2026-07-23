ALTER TABLE "CompanyFinanceSettings" ADD COLUMN IF NOT EXISTS "quotePrefix" TEXT;
ALTER TABLE "CompanyInvoiceCounter" ADD COLUMN IF NOT EXISTS "quoteNextNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "number" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Quote_companyId_number_key" ON "Quote"("companyId", "number");
