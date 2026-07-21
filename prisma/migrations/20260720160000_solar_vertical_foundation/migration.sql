-- Convert Rev Engine from a generic field-service product into a solar O&M platform.

CREATE TYPE "SolarSiteStatus" AS ENUM ('COMMISSIONING', 'OPERATIONAL', 'DEGRADED', 'OFFLINE', 'MAINTENANCE');
CREATE TYPE "SolarFaultSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "SolarFaultStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'IGNORED');

ALTER TABLE "Asset"
  ADD COLUMN "parentAssetId" TEXT,
  ADD COLUMN "monitoringIdentifier" TEXT,
  ADD COLUMN "dcCapacityKw" DECIMAL(12,3),
  ADD COLUMN "acCapacityKw" DECIMAL(12,3),
  ADD COLUMN "batteryCapacityKwh" DECIMAL(12,3),
  ADD COLUMN "moduleCount" INTEGER,
  ADD COLUMN "commissionedAt" TIMESTAMP(3);

CREATE TABLE "SolarSiteProfile" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "siteCode" TEXT,
  "status" "SolarSiteStatus" NOT NULL DEFAULT 'COMMISSIONING',
  "installedCapacityKwp" DECIMAL(12,3),
  "acCapacityKw" DECIMAL(12,3),
  "batteryCapacityKwh" DECIMAL(12,3),
  "moduleCount" INTEGER,
  "inverterCount" INTEGER,
  "monitoringProvider" TEXT,
  "monitoringSiteId" TEXT,
  "gridConnectionType" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "targetPerformanceRatioPct" DECIMAL(6,2),
  "targetAvailabilityPct" DECIMAL(6,2),
  "lastInspectionAt" TIMESTAMP(3),
  "nextInspectionDueAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SolarSiteProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SolarReading" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "assetId" TEXT,
  "jobId" TEXT,
  "capturedById" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "condition" TEXT NOT NULL DEFAULT 'NORMAL',
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "powerKw" DECIMAL(12,3),
  "energyTodayKwh" DECIMAL(14,3),
  "lifetimeEnergyKwh" DECIMAL(16,3),
  "irradianceWm2" DECIMAL(10,2),
  "ambientTemperatureC" DECIMAL(7,2),
  "moduleTemperatureC" DECIMAL(7,2),
  "dcVoltageV" DECIMAL(12,3),
  "dcCurrentA" DECIMAL(12,3),
  "acVoltageV" DECIMAL(12,3),
  "acCurrentA" DECIMAL(12,3),
  "frequencyHz" DECIMAL(8,3),
  "batterySocPct" DECIMAL(6,2),
  "batterySohPct" DECIMAL(6,2),
  "batteryVoltageV" DECIMAL(12,3),
  "performanceRatioPct" DECIMAL(6,2),
  "availabilityPct" DECIMAL(6,2),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SolarReading_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SolarFault" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "assetId" TEXT,
  "jobId" TEXT,
  "reportedById" TEXT,
  "faultCode" TEXT,
  "category" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "severity" "SolarFaultSeverity" NOT NULL DEFAULT 'MEDIUM',
  "status" "SolarFaultStatus" NOT NULL DEFAULT 'OPEN',
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "downtimeMinutes" INTEGER,
  "estimatedEnergyLossKwh" DECIMAL(14,3),
  "rootCause" TEXT,
  "correctiveAction" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SolarFault_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SolarSiteProfile_propertyId_key" ON "SolarSiteProfile"("propertyId");
CREATE UNIQUE INDEX "SolarSiteProfile_companyId_siteCode_key" ON "SolarSiteProfile"("companyId", "siteCode");
CREATE INDEX "SolarSiteProfile_companyId_customerId_idx" ON "SolarSiteProfile"("companyId", "customerId");
CREATE INDEX "SolarSiteProfile_companyId_status_idx" ON "SolarSiteProfile"("companyId", "status");
CREATE INDEX "SolarReading_companyId_propertyId_recordedAt_idx" ON "SolarReading"("companyId", "propertyId", "recordedAt");
CREATE INDEX "SolarReading_companyId_assetId_recordedAt_idx" ON "SolarReading"("companyId", "assetId", "recordedAt");
CREATE INDEX "SolarReading_companyId_condition_recordedAt_idx" ON "SolarReading"("companyId", "condition", "recordedAt");
CREATE INDEX "SolarFault_companyId_propertyId_status_idx" ON "SolarFault"("companyId", "propertyId", "status");
CREATE INDEX "SolarFault_companyId_assetId_status_idx" ON "SolarFault"("companyId", "assetId", "status");
CREATE INDEX "SolarFault_companyId_severity_status_idx" ON "SolarFault"("companyId", "severity", "status");
CREATE INDEX "SolarFault_companyId_detectedAt_idx" ON "SolarFault"("companyId", "detectedAt");
CREATE INDEX "Asset_companyId_parentAssetId_idx" ON "Asset"("companyId", "parentAssetId");
CREATE INDEX "Asset_companyId_assetType_idx" ON "Asset"("companyId", "assetType");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SolarSiteProfile" ADD CONSTRAINT "SolarSiteProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolarSiteProfile" ADD CONSTRAINT "SolarSiteProfile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolarSiteProfile" ADD CONSTRAINT "SolarSiteProfile_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "CustomerProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolarReading" ADD CONSTRAINT "SolarReading_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolarReading" ADD CONSTRAINT "SolarReading_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolarReading" ADD CONSTRAINT "SolarReading_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "CustomerProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolarReading" ADD CONSTRAINT "SolarReading_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SolarReading" ADD CONSTRAINT "SolarReading_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SolarReading" ADD CONSTRAINT "SolarReading_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SolarFault" ADD CONSTRAINT "SolarFault_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolarFault" ADD CONSTRAINT "SolarFault_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolarFault" ADD CONSTRAINT "SolarFault_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "CustomerProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolarFault" ADD CONSTRAINT "SolarFault_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SolarFault" ADD CONSTRAINT "SolarFault_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SolarFault" ADD CONSTRAINT "SolarFault_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every workspace is now a solar workspace.
UPDATE "Company" SET "verticalKey" = 'solar-om';

-- Existing customer properties become solar sites, so current data is not stranded.
INSERT INTO "SolarSiteProfile" (
  "id", "companyId", "customerId", "propertyId", "siteCode", "status", "targetPerformanceRatioPct", "targetAvailabilityPct", "createdAt", "updatedAt"
)
SELECT
  'solar-site-' || substr(md5(p."id"), 1, 24),
  p."companyId",
  p."customerId",
  p."id",
  'SITE-' || upper(substr(md5(p."id"), 1, 6)),
  'COMMISSIONING'::"SolarSiteStatus",
  75.00,
  98.00,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "CustomerProperty" p
WHERE NOT EXISTS (SELECT 1 FROM "SolarSiteProfile" sp WHERE sp."propertyId" = p."id");

-- Solar service catalogue for every existing company.
INSERT INTO "Service" ("id", "companyId", "name", "description", "price", "active", "createdAt", "updatedAt")
SELECT 'solar-service-' || substr(md5(c."id" || ':' || v.name), 1, 24), c."id", v.name, v.description, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
CROSS JOIN (VALUES
  ('Solar Site Assessment', 'Site survey, system inventory, capacity capture, safety review, and baseline condition report.'),
  ('Solar Preventive Maintenance', 'Planned mechanical and electrical inspection of the complete solar plant.'),
  ('Inverter Diagnostics', 'Alarm review, electrical measurements, firmware checks, and inverter fault diagnosis.'),
  ('PV Module Cleaning', 'Safe module cleaning with before-and-after condition evidence.'),
  ('Battery Health Assessment', 'Battery state-of-charge, state-of-health, voltage, temperature, and connection checks.'),
  ('Solar Fault Callout', 'Reactive investigation and corrective work for an underperforming or offline solar site.')
) AS v(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM "Service" s WHERE s."companyId" = c."id" AND lower(s."name") = lower(v.name)
);
