ALTER TABLE public."BuyerDemandEvent"
  ADD COLUMN "buyerName" TEXT,
  ADD COLUMN "buyerEmail" TEXT,
  ADD COLUMN "companyName" TEXT,
  ADD COLUMN "interest" TEXT,
  ADD COLUMN "message" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SEARCH',
  ADD COLUMN "contactConsentAt" TIMESTAMP(3);

CREATE INDEX "BuyerDemandEvent_buyerEmail_createdAt_idx"
  ON public."BuyerDemandEvent"("buyerEmail", "createdAt");
