ALTER TABLE "Dataset"
  ADD COLUMN "monthlyPriceCents" INTEGER,
  ADD COLUMN "annualPriceCents" INTEGER;

CREATE TABLE "MarketplaceSubscription" (
  "id" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "stripeSubscriptionId" TEXT,
  "stripeCustomerId" TEXT,
  "stripeCheckoutSessionId" TEXT,
  "billingInterval" TEXT NOT NULL,
  "unitAmountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'INCOMPLETE',
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketplaceSubscription_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketplaceSubscription_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MarketplaceSubscription_stripeSubscriptionId_key" ON "MarketplaceSubscription"("stripeSubscriptionId");
CREATE UNIQUE INDEX "MarketplaceSubscription_stripeCheckoutSessionId_key" ON "MarketplaceSubscription"("stripeCheckoutSessionId");
CREATE INDEX "MarketplaceSubscription_buyerId_status_idx" ON "MarketplaceSubscription"("buyerId", "status");
CREATE INDEX "MarketplaceSubscription_datasetId_status_idx" ON "MarketplaceSubscription"("datasetId", "status");


CREATE TABLE "DatasetRightsReview" (
  "id" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "termsUrl" TEXT NOT NULL,
  "evidenceNote" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DatasetRightsReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DatasetRightsReview_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DatasetRightsReview_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DatasetRightsReview_datasetId_reviewedAt_idx" ON "DatasetRightsReview"("datasetId", "reviewedAt");
CREATE INDEX "DatasetRightsReview_sellerId_reviewedAt_idx" ON "DatasetRightsReview"("sellerId", "reviewedAt");
