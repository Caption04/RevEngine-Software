-- Remove seed-only labels from normal customer-facing records.
-- The known seed IDs and exact old values keep this migration from changing customer-created data.

UPDATE "Company"
SET
  "name" = 'Rev Engine Zimbabwe',
  "legalName" = 'Rev Engine Zimbabwe (Private) Limited',
  "registrationNumber" = 'ZW-REG-0001',
  "taxNumber" = 'ZW-VAT-0001',
  "address" = 'Harare, Zimbabwe'
WHERE "id" = 'revengine-zw-demo'
  AND "name" = 'Rev Engine Zimbabwe Demo';

UPDATE "Company"
SET
  "name" = 'Rev Engine South Africa',
  "legalName" = 'Rev Engine South Africa (Pty) Ltd',
  "registrationNumber" = 'SA-REG-0001',
  "taxNumber" = 'SA-VAT-0001',
  "address" = 'Johannesburg, South Africa'
WHERE "id" = 'revengine-sa-demo'
  AND "name" = 'Rev Engine South Africa Demo';

UPDATE "BusinessGroup" bg
SET "name" = 'Rev Engine Zimbabwe'
FROM "Company" c
WHERE c."groupId" = bg."id"
  AND c."id" = 'revengine-zw-demo'
  AND bg."name" = 'Rev Engine Zimbabwe Demo';

UPDATE "BusinessGroup" bg
SET "name" = 'Rev Engine South Africa'
FROM "Company" c
WHERE c."groupId" = bg."id"
  AND c."id" = 'revengine-sa-demo'
  AND bg."name" = 'Rev Engine South Africa Demo';

UPDATE "User"
SET "name" = 'Zimbabwe Owner'
WHERE "companyId" = 'revengine-zw-demo'
  AND "name" = 'Zimbabwe Demo Owner';

UPDATE "User"
SET "name" = 'Zimbabwe Admin'
WHERE "companyId" = 'revengine-zw-demo'
  AND "name" = 'Zimbabwe Demo Admin';

UPDATE "User"
SET "name" = 'Harare Solar Client'
WHERE "companyId" = 'revengine-zw-demo'
  AND "name" = 'Harare Demo Client';

UPDATE "User"
SET "name" = 'South Africa Owner'
WHERE "companyId" = 'revengine-sa-demo'
  AND "name" = 'South Africa Demo Owner';

UPDATE "User"
SET "name" = 'South Africa Admin'
WHERE "companyId" = 'revengine-sa-demo'
  AND "name" = 'South Africa Demo Admin';

UPDATE "User"
SET "name" = 'Johannesburg Solar Client'
WHERE "companyId" = 'revengine-sa-demo'
  AND "name" = 'Johannesburg Demo Client';

UPDATE "WorkerDevice"
SET "deviceName" = 'ZW Technician Phone'
WHERE "companyId" = 'revengine-zw-demo'
  AND "deviceName" = 'ZW Demo Technician Phone';

UPDATE "WorkerDevice"
SET "deviceName" = 'SA Technician Phone'
WHERE "companyId" = 'revengine-sa-demo'
  AND "deviceName" = 'SA Demo Technician Phone';

UPDATE "Customer"
SET "notes" = 'Solar O&M customer.'
WHERE "companyId" IN ('revengine-zw-demo', 'revengine-sa-demo')
  AND "notes" IN ('ZW clean demo customer.', 'SA clean demo customer.');

UPDATE "CustomerProperty"
SET "notes" = 'Solar O&M site.'
WHERE "companyId" IN ('revengine-zw-demo', 'revengine-sa-demo')
  AND "notes" = 'Solar O&M demo site.';

UPDATE "SolarSiteProfile"
SET "monitoringProvider" = 'Solar Monitoring Portal'
WHERE "companyId" IN ('revengine-zw-demo', 'revengine-sa-demo')
  AND "monitoringProvider" = 'Demo Monitoring Portal';

UPDATE "Asset"
SET "serialNumber" = REPLACE("serialNumber", '-DEMO-INVERTER-', '-INVERTER-SN-')
WHERE "companyId" IN ('revengine-zw-demo', 'revengine-sa-demo')
  AND "serialNumber" LIKE '%-DEMO-INVERTER-%';
