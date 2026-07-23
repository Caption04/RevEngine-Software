ALTER TABLE "DocumentTemplate"
  ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "DocumentTemplate"
SET "isSystem" = TRUE
WHERE "sourceType" = 'STARTER'
  AND "currentVersion" >= 1
  AND ("name", "documentType") IN (
    ('Professional invoice', 'INVOICE'),
    ('Professional quote', 'QUOTE'),
    ('Professional contract', 'CONTRACT'),
    ('Classic invoice', 'INVOICE'),
    ('Minimal quote', 'QUOTE')
  );

CREATE INDEX "DocumentTemplate_companyId_isSystem_idx"
  ON "DocumentTemplate"("companyId", "isSystem");

UPDATE "DocumentTemplate"
SET "design" = jsonb_set(
  "design",
  '{variant}',
  to_jsonb(CASE
    WHEN lower("name") LIKE '%classic%' THEN 'CLASSIC'::text
    WHEN lower("name") LIKE '%minimal%' THEN 'MINIMAL'::text
    ELSE 'PROFESSIONAL'::text
  END),
  TRUE
)
WHERE "isSystem" = TRUE
  AND NOT ("design" ? 'variant');

UPDATE "DocumentTemplateVersion" AS version
SET "design" = jsonb_set(
  version."design",
  '{variant}',
  to_jsonb(CASE
    WHEN lower(template."name") LIKE '%classic%' THEN 'CLASSIC'::text
    WHEN lower(template."name") LIKE '%minimal%' THEN 'MINIMAL'::text
    ELSE 'PROFESSIONAL'::text
  END),
  TRUE
)
FROM "DocumentTemplate" AS template
WHERE version."templateId" = template."id"
  AND template."isSystem" = TRUE
  AND NOT (version."design" ? 'variant');

-- Convert untouched drafts created by the old "Start from scratch" flow into a truly blank page.
UPDATE "DocumentTemplate"
SET "design" = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        "design",
        '{variant}',
        '"BLANK"'::jsonb,
        TRUE
      ),
      '{blocks}',
      '[]'::jsonb,
      TRUE
    ),
    '{header,visible}',
    'false'::jsonb,
    TRUE
  ),
  '{page,showPageNumbers}',
  'false'::jsonb,
  TRUE
)
WHERE "sourceType" = 'BLANK'
  AND "currentVersion" = 0
  AND NOT ("design" ? 'variant')
  AND jsonb_typeof("design" -> 'blocks') = 'array'
  AND jsonb_array_length("design" -> 'blocks') = 2
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("design" -> 'blocks') AS block
    WHERE block ->> 'type' NOT IN ('CUSTOMER_DETAILS', 'DOCUMENT_DETAILS')
  );
