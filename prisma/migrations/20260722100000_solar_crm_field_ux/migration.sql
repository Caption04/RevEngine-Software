-- Distinguish residential and business customers and keep one trusted-device record per browser profile.
CREATE TYPE "CustomerType" AS ENUM ('RESIDENTIAL', 'BUSINESS');

ALTER TABLE "Customer"
ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'RESIDENTIAL',
ADD COLUMN "companyName" TEXT;

ALTER TABLE "Lead"
ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'RESIDENTIAL';

ALTER TABLE "BookingRequest"
ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'RESIDENTIAL',
ADD COLUMN "companyName" TEXT;

ALTER TABLE "UserSession"
ADD COLUMN "deviceKey" TEXT;

CREATE UNIQUE INDEX "UserSession_deviceKey_key" ON "UserSession"("deviceKey");

-- Installation is part of the solar lifecycle even while Rev Engine stays maintenance-first.
INSERT INTO "Service" ("id", "companyId", "name", "description", "price", "active", "createdAt", "updatedAt")
SELECT
  'solar-service-' || substr(md5(c."id" || ':Solar System Installation'), 1, 24),
  c."id",
  'Solar System Installation',
  'New residential or commercial solar system installation, testing, commissioning, and customer handover.',
  0,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Company" c
WHERE NOT EXISTS (
  SELECT 1
  FROM "Service" s
  WHERE s."companyId" = c."id"
    AND lower(s."name") = lower('Solar System Installation')
);
