-- Create seller-run auctions and buyer bids. Bids are offers only; no payment is captured.
CREATE TABLE "Auction" (
  "id" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "startingBidCents" INTEGER NOT NULL,
  "reservePriceCents" INTEGER,
  "minimumIncrementCents" INTEGER NOT NULL DEFAULT 100,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "rightsConfirmedAt" TIMESTAMP(3) NOT NULL,
  "closesAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuctionBid" (
  "id" TEXT NOT NULL,
  "auctionId" TEXT NOT NULL,
  "bidderId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuctionBid_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Auction_status_closesAt_idx" ON "Auction"("status", "closesAt");
CREATE INDEX "Auction_datasetId_createdAt_idx" ON "Auction"("datasetId", "createdAt");
CREATE INDEX "AuctionBid_auctionId_amountCents_idx" ON "AuctionBid"("auctionId", "amountCents");
CREATE INDEX "AuctionBid_bidderId_createdAt_idx" ON "AuctionBid"("bidderId", "createdAt");
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_auctionId_fkey"
  FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_bidderId_fkey"
  FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
