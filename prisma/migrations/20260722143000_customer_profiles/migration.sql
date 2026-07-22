CREATE TABLE "CustomerContact" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerNote" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "createdById" TEXT,
  "note" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "technicianVisible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerContact_companyId_customerId_idx" ON "CustomerContact"("companyId", "customerId");
CREATE INDEX "CustomerContact_companyId_customerId_isPrimary_idx" ON "CustomerContact"("companyId", "customerId", "isPrimary");
CREATE INDEX "CustomerNote_companyId_customerId_createdAt_idx" ON "CustomerNote"("companyId", "customerId", "createdAt");
CREATE INDEX "CustomerNote_companyId_customerId_technicianVisible_idx" ON "CustomerNote"("companyId", "customerId", "technicianVisible");

ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "CustomerContact" ("id", "companyId", "customerId", "name", "role", "email", "phone", "isPrimary", "createdAt", "updatedAt")
SELECT 'cc_' || md5(c."id" || ':primary'), c."companyId", c."id", c."name", 'Primary contact', c."email", c."phone", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Customer" c
WHERE NOT EXISTS (
  SELECT 1 FROM "CustomerContact" cc WHERE cc."customerId" = c."id" AND cc."isPrimary" = true
);
