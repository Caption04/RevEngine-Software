CREATE TABLE "DocumentTemplate" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'STARTER',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "design" JSONB NOT NULL,
  "currentVersion" INTEGER NOT NULL DEFAULT 0,
  "importFileName" TEXT,
  "importMimeType" TEXT,
  "importSourceUrl" TEXT,
  "importStatus" TEXT,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentTemplateVersion" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "design" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentTemplate_companyId_documentType_status_idx" ON "DocumentTemplate"("companyId", "documentType", "status");
CREATE INDEX "DocumentTemplate_companyId_documentType_isDefault_idx" ON "DocumentTemplate"("companyId", "documentType", "isDefault");
CREATE INDEX "DocumentTemplate_companyId_updatedAt_idx" ON "DocumentTemplate"("companyId", "updatedAt");
CREATE UNIQUE INDEX "DocumentTemplateVersion_templateId_version_key" ON "DocumentTemplateVersion"("templateId", "version");
CREATE INDEX "DocumentTemplateVersion_companyId_templateId_createdAt_idx" ON "DocumentTemplateVersion"("companyId", "templateId", "createdAt");

ALTER TABLE "DocumentTemplate"
  ADD CONSTRAINT "DocumentTemplate_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentTemplateVersion"
  ADD CONSTRAINT "DocumentTemplateVersion_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentTemplateVersion"
  ADD CONSTRAINT "DocumentTemplateVersion_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quote"
  ADD COLUMN "documentTemplateId" TEXT,
  ADD COLUMN "documentTemplateVersion" INTEGER;

ALTER TABLE "Invoice"
  ADD COLUMN "documentTemplateId" TEXT,
  ADD COLUMN "documentTemplateVersion" INTEGER;

ALTER TABLE "ServiceContract"
  ADD COLUMN "documentTemplateId" TEXT,
  ADD COLUMN "documentTemplateVersion" INTEGER;

CREATE INDEX "Quote_companyId_documentTemplateId_idx" ON "Quote"("companyId", "documentTemplateId");
CREATE INDEX "Invoice_companyId_documentTemplateId_idx" ON "Invoice"("companyId", "documentTemplateId");
CREATE INDEX "ServiceContract_companyId_documentTemplateId_idx" ON "ServiceContract"("companyId", "documentTemplateId");
