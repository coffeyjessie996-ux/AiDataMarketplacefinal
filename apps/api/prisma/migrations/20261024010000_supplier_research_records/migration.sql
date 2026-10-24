CREATE TABLE "SupplierResearchRecord" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "supplierName" TEXT,
    "awardAmount" DECIMAL(18,2),
    "sourceUrl" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierResearchRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierResearchRecord_source_sourceRecordId_key"
    ON "SupplierResearchRecord"("source", "sourceRecordId");

CREATE INDEX "SupplierResearchRecord_supplierName_idx"
    ON "SupplierResearchRecord"("supplierName");

CREATE INDEX "SupplierResearchRecord_retrievedAt_idx"
    ON "SupplierResearchRecord"("retrievedAt");
