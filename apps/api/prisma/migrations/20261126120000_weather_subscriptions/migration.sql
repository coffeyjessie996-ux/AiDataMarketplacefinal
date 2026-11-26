CREATE TABLE "WeatherSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stripeCustomerId" TEXT NOT NULL,
  "stripeSubscriptionId" TEXT NOT NULL,
  "stripePriceId" TEXT,
  "planKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeatherSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeatherSubscription_stripeSubscriptionId_key"
  ON "WeatherSubscription"("stripeSubscriptionId");
CREATE INDEX "WeatherSubscription_userId_status_idx"
  ON "WeatherSubscription"("userId", "status");
CREATE INDEX "WeatherSubscription_stripeCustomerId_idx"
  ON "WeatherSubscription"("stripeCustomerId");
CREATE INDEX "StripeWebhookEvent_type_processedAt_idx"
  ON "StripeWebhookEvent"("type", "processedAt");

ALTER TABLE "WeatherSubscription"
  ADD CONSTRAINT "WeatherSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The API accesses these tables through its server-side PostgreSQL connection.
-- Keep them inaccessible to Supabase's public Data API roles.
ALTER TABLE "WeatherSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StripeWebhookEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "WeatherSubscription" FROM anon, authenticated;
REVOKE ALL ON TABLE "StripeWebhookEvent" FROM anon, authenticated;
