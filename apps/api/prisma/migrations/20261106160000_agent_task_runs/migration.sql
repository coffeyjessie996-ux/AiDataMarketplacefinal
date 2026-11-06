CREATE TABLE "AgentTaskRun" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "agentType" TEXT NOT NULL DEFAULT 'automation',
    "taskName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "message" TEXT NOT NULL,
    "recordsFetched" INTEGER NOT NULL DEFAULT 0,
    "recordsSaved" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentTaskRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentTaskRun_startedAt_idx" ON "AgentTaskRun"("startedAt");
CREATE INDEX "AgentTaskRun_status_startedAt_idx" ON "AgentTaskRun"("status", "startedAt");
