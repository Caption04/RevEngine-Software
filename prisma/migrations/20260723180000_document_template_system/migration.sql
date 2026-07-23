ALTER TABLE "CompanyFinanceSettings"
  ADD COLUMN IF NOT EXISTS "documentTemplate" TEXT NOT NULL DEFAULT 'MODERN',
  ADD COLUMN IF NOT EXISTS "documentHeaderStyle" TEXT NOT NULL DEFAULT 'SPLIT',
  ADD COLUMN IF NOT EXISTS "documentLogoPosition" TEXT NOT NULL DEFAULT 'LEFT',
  ADD COLUMN IF NOT EXISTS "documentLogoSize" TEXT NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS "documentTableDensity" TEXT NOT NULL DEFAULT 'COMFORTABLE',
  ADD COLUMN IF NOT EXISTS "quoteLabel" TEXT NOT NULL DEFAULT 'QUOTE',
  ADD COLUMN IF NOT EXISTS "invoiceLabel" TEXT NOT NULL DEFAULT 'INVOICE',
  ADD COLUMN IF NOT EXISTS "showDocumentLogo" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "showCompanyAddress" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "showCompanyEmail" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "showCompanyPhone" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "showCompanyWebsite" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "showTax" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "showPurchaseOrder" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "showNotes" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "showPaymentInstructions" BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill every historic quote that has no customer-facing number. The next
-- number starts after the largest existing numeric number for that company and
-- prefix, so existing customer documents are never renamed.
WITH company_prefix AS (
  SELECT
    c."id" AS "companyId",
    COALESCE(NULLIF(BTRIM(f."quotePrefix"), ''), 'Q') AS prefix
  FROM "Company" c
  LEFT JOIN "CompanyFinanceSettings" f ON f."companyId" = c."id"
), existing_max AS (
  SELECT
    cp."companyId",
    cp.prefix,
    COALESCE(MAX(
      CASE
        WHEN LEFT(q."number", LENGTH(cp.prefix) + 1) = cp.prefix || '-'
         AND SUBSTRING(q."number" FROM LENGTH(cp.prefix) + 2) ~ '^[0-9]+$'
        THEN CAST(SUBSTRING(q."number" FROM LENGTH(cp.prefix) + 2) AS INTEGER)
        ELSE NULL
      END
    ), 0) AS max_number
  FROM company_prefix cp
  LEFT JOIN "Quote" q ON q."companyId" = cp."companyId"
  GROUP BY cp."companyId", cp.prefix
), pending AS (
  SELECT
    q."id",
    q."companyId",
    em.prefix,
    em.max_number,
    ROW_NUMBER() OVER (PARTITION BY q."companyId" ORDER BY q."createdAt", q."id") AS row_number
  FROM "Quote" q
  JOIN existing_max em ON em."companyId" = q."companyId"
  WHERE q."number" IS NULL OR BTRIM(q."number") = ''
)
UPDATE "Quote" q
SET "number" = p.prefix || '-' || LPAD(
  (p.max_number + p.row_number)::TEXT,
  GREATEST(4, LENGTH((p.max_number + p.row_number)::TEXT)),
  '0'
)
FROM pending p
WHERE q."id" = p."id";

-- Keep the shared quote allocator ahead of all existing numbers after backfill.
INSERT INTO "CompanyInvoiceCounter" (
  "id", "companyId", "prefix", "nextNumber", "quoteNextNumber",
  "receiptNextNumber", "creditNoteNextNumber", "padding", "createdAt", "updatedAt"
)
SELECT
  'counter_' || c."id",
  c."id",
  COALESCE(NULLIF(BTRIM(f."invoicePrefix"), ''), 'INV'),
  1,
  COALESCE((
    SELECT MAX(
      CASE
        WHEN LEFT(q."number", LENGTH(COALESCE(NULLIF(BTRIM(f."quotePrefix"), ''), 'Q')) + 1)
             = COALESCE(NULLIF(BTRIM(f."quotePrefix"), ''), 'Q') || '-'
         AND SUBSTRING(q."number" FROM LENGTH(COALESCE(NULLIF(BTRIM(f."quotePrefix"), ''), 'Q')) + 2) ~ '^[0-9]+$'
        THEN CAST(SUBSTRING(q."number" FROM LENGTH(COALESCE(NULLIF(BTRIM(f."quotePrefix"), ''), 'Q')) + 2) AS INTEGER)
        ELSE NULL
      END
    )
    FROM "Quote" q
    WHERE q."companyId" = c."id"
  ), 0) + 1,
  1,
  1,
  4,
  NOW(),
  NOW()
FROM "Company" c
LEFT JOIN "CompanyFinanceSettings" f ON f."companyId" = c."id"
ON CONFLICT ("companyId") DO UPDATE
SET "quoteNextNumber" = GREATEST("CompanyInvoiceCounter"."quoteNextNumber", EXCLUDED."quoteNextNumber"),
    "updatedAt" = NOW();
