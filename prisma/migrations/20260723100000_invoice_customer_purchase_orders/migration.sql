ALTER TABLE "Invoice" ADD COLUMN "purchaseOrderNumber" TEXT;

CREATE INDEX "Invoice_companyId_purchaseOrderNumber_idx" ON "Invoice"("companyId", "purchaseOrderNumber");
