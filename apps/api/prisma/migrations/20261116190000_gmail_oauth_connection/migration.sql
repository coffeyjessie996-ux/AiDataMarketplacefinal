CREATE TABLE "GmailConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "senderEmail" TEXT NOT NULL,
  "encryptedRefreshToken" TEXT NOT NULL,
  "tokenIv" TEXT NOT NULL,
  "tokenAuthTag" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GmailConnection_userId_key" ON "GmailConnection"("userId");
ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GmailOAuthState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GmailOAuthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GmailOAuthState_stateHash_key" ON "GmailOAuthState"("stateHash");
CREATE INDEX "GmailOAuthState_userId_expiresAt_idx" ON "GmailOAuthState"("userId", "expiresAt");
ALTER TABLE "GmailOAuthState" ADD CONSTRAINT "GmailOAuthState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
