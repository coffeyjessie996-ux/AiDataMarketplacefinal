ALTER TABLE "Lead"
  ADD COLUMN "expectedDealValueCents" INTEGER,
  ADD COLUMN "expectedMarginPercent" DECIMAL(5,2) NOT NULL DEFAULT 20.00;
