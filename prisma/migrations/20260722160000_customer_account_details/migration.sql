CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'INACTIVE');
CREATE TYPE "PreferredContactMethod" AS ENUM ('PHONE', 'WHATSAPP', 'EMAIL');
CREATE TYPE "CustomerPaymentTerms" AS ENUM ('DUE_ON_RECEIPT', 'NET_7', 'NET_14', 'NET_30', 'NET_60');

ALTER TABLE "Customer"
  ADD COLUMN "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "customerReference" TEXT,
  ADD COLUMN "registeredCompanyName" TEXT,
  ADD COLUMN "registrationNumber" TEXT,
  ADD COLUMN "taxNumber" TEXT,
  ADD COLUMN "industry" TEXT,
  ADD COLUMN "alternatePhone" TEXT,
  ADD COLUMN "preferredContactMethod" "PreferredContactMethod",
  ADD COLUMN "billingEmail" TEXT,
  ADD COLUMN "billingContactName" TEXT,
  ADD COLUMN "paymentTerms" "CustomerPaymentTerms" NOT NULL DEFAULT 'DUE_ON_RECEIPT',
  ADD COLUMN "purchaseOrderRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "serviceNotes" TEXT,
  ADD COLUMN "internalNotes" TEXT;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS row_number
  FROM "Customer"
)
UPDATE "Customer" AS customer
SET "customerReference" = 'CUS-' || LPAD(ranked.row_number::text, 6, '0')
FROM ranked
WHERE customer."id" = ranked."id" AND customer."customerReference" IS NULL;

UPDATE "Customer"
SET "serviceNotes" = "notes"
WHERE "serviceNotes" IS NULL AND "notes" IS NOT NULL;

CREATE UNIQUE INDEX "Customer_companyId_customerReference_key"
ON "Customer"("companyId", "customerReference");
