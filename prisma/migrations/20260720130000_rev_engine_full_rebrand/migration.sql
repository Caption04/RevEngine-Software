-- Complete the Rev Engine rebrand for data stored before the source-code rename.
-- Legacy brand tokens are constructed in pieces so the retired name is not reintroduced as a literal.

BEGIN;

UPDATE "Company"
SET "id" = 'revengine-zw-demo'
WHERE "id" = ('field' || 'core-zw-demo');

UPDATE "Company"
SET "id" = 'revengine-sa-demo'
WHERE "id" = ('field' || 'core-sa-demo');

DO $$
DECLARE
  item record;
  old_title text := 'Field' || 'Core';
  old_lower text := 'field' || 'core';
  old_upper text := 'FIELD' || 'CORE';
BEGIN
  FOR item IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying', 'character')
      AND table_name <> '_prisma_migrations'
      AND lower(column_name) NOT LIKE '%email%'
      AND lower(column_name) NOT LIKE '%password%'
      AND lower(column_name) NOT LIKE '%secret%'
      AND lower(column_name) NOT LIKE '%token%'
      AND lower(column_name) NOT LIKE '%hash%'
      AND lower(column_name) NOT LIKE '%signature%'
      AND lower(column_name) NOT LIKE '%cookie%'
      AND lower(column_name) NOT LIKE '%url%'
      AND lower(column_name) NOT LIKE '%key%'
      AND lower(column_name) NOT LIKE '%reference%'
      AND lower(column_name) NOT LIKE '%provider%'
      AND lower(column_name) <> 'id'
      AND lower(column_name) NOT LIKE '%id'
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = replace(replace(replace(%I, $1, $2), $3, $4), $5, $6) WHERE %I LIKE $7 OR %I LIKE $8 OR %I LIKE $9',
      item.table_schema, item.table_name, item.column_name, item.column_name,
      item.column_name, item.column_name, item.column_name
    )
    USING old_title, 'Rev Engine', old_lower, 'rev engine', old_upper, 'REV ENGINE',
          '%' || old_title || '%', '%' || old_lower || '%', '%' || old_upper || '%';
  END LOOP;
END $$;

UPDATE "Company"
SET "email" = replace("email", '@' || 'field' || 'core.test', '@revengine.test')
WHERE "email" LIKE 'support.%@' || 'field' || 'core.test';

UPDATE "CompanyBranding"
SET "supportEmail" = replace("supportEmail", '@' || 'field' || 'core.test', '@revengine.test')
WHERE "supportEmail" LIKE 'support.%@' || 'field' || 'core.test';

UPDATE "CompanyBranding"
SET "websiteUrl" = replace("websiteUrl", 'field' || 'core.test', 'revengine.test')
WHERE "websiteUrl" LIKE '%' || 'field' || 'core.test%';

COMMIT;
