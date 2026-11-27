-- These tables contain buyer billing identifiers and seller-provided rights-review evidence.
-- The application accesses them through the trusted API server using Prisma/DATABASE_URL.
-- Do not expose them directly through Supabase's public Data/GraphQL API.
ALTER TABLE "MarketplaceSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DatasetRightsReview" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "MarketplaceSubscription" FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE "DatasetRightsReview" FROM PUBLIC, anon, authenticated;
