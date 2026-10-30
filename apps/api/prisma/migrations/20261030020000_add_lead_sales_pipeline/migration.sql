-- Lead acquisition and sales-stage tracking.
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'QUALIFIED', 'CONTACTED', 'PROPOSAL', 'WON', 'LOST');

CREATE TABLE "Lead" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceRecordId" TEXT,
  "sourceKey" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "contactName" TEXT,
  "email" TEXT,
  "website" TEXT,
  "description" TEXT,
  "awardAmount" DECIMAL(18,2),
  "score" INTEGER NOT NULL DEFAULT 0,
  "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
  "notes" TEXT,
  "nextFollowUpAt" TIMESTAMP(3),
  "lastContactedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Lead_sourceKey_key" ON "Lead"("sourceKey");
CREATE INDEX "Lead_ownerId_stage_idx" ON "Lead"("ownerId", "stage");
CREATE INDEX "Lead_score_idx" ON "Lead"("score");
CREATE INDEX "Lead_nextFollowUpAt_idx" ON "Lead"("nextFollowUpAt");

CREATE TABLE "LeadActivity" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- The Express API uses its trusted DATABASE_URL role; exposed Supabase client roles
-- receive no policies and therefore cannot read these tables directly.
ALTER TABLE public."Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LeadActivity" ENABLE ROW LEVEL SECURITY;
