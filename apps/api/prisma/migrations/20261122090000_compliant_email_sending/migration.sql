CREATE TABLE "OutboundEmail" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SENDING',
  "idempotencyKey" TEXT NOT NULL,
  "recipientDayKey" TEXT NOT NULL,
  "unsubscribeTokenHash" TEXT NOT NULL,
  "gmailMessageId" TEXT,
  "failureReason" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboundEmail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutboundEmail_idempotencyKey_key" ON "OutboundEmail"("idempotencyKey");
CREATE UNIQUE INDEX "OutboundEmail_recipientDayKey_key" ON "OutboundEmail"("recipientDayKey");
CREATE UNIQUE INDEX "OutboundEmail_unsubscribeTokenHash_key" ON "OutboundEmail"("unsubscribeTokenHash");
CREATE INDEX "OutboundEmail_userId_createdAt_idx" ON "OutboundEmail"("userId", "createdAt");
CREATE INDEX "OutboundEmail_recipient_createdAt_idx" ON "OutboundEmail"("recipient", "createdAt");
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EmailSuppression" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT 'UNSUBSCRIBED',
  "source" TEXT NOT NULL DEFAULT 'unsubscribe_link',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailSuppression_email_key" ON "EmailSuppression"("email");

ALTER TABLE "OutboundEmail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailSuppression" ENABLE ROW LEVEL SECURITY;