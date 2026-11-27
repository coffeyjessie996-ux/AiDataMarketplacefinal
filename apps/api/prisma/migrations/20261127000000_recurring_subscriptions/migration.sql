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
