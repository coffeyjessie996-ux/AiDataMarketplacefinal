CREATE TABLE "BuyerDemandEvent" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "category" TEXT,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuyerDemandEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BuyerDemandEvent_createdAt_idx"
    ON "BuyerDemandEvent"("createdAt");

CREATE INDEX "BuyerDemandEvent_query_createdAt_idx"
    ON "BuyerDemandEvent"("query", "createdAt");

CREATE INDEX "BuyerDemandEvent_category_createdAt_idx"
    ON "BuyerDemandEvent"("category", "createdAt");
