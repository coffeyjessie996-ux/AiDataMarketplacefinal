import type { PrismaClient } from '@prisma/client';

export const STALE_AGENT_TASK_MINUTES = 120;

export async function reconcileStaleAgentTasks(prisma: PrismaClient, now = new Date()) {
  const staleBefore = new Date(now.getTime() - STALE_AGENT_TASK_MINUTES * 60_000);
  const result = await prisma.agentTaskRun.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: staleBefore } },
    data: {
      status: 'FAILED',
      completedAt: now,
      message: 'Automatically marked failed by the maintenance team: task remained RUNNING beyond the safe timeout. No source data or customer records were changed.',
      recordsFailed: { increment: 1 },
    },
  });

  if (result.count > 0) {
    await prisma.agentTaskRun.create({
      data: {
        agentName: 'Marketplace Maintenance Team',
        agentType: 'maintenance',
        taskName: 'Reconcile stale agent tasks',
        status: 'COMPLETED',
        message: `Maintenance safely marked ${result.count} stale RUNNING task(s) as FAILED. It did not rerun collectors or modify marketplace/customer/payment data.`,
        recordsFetched: result.count,
        recordsSaved: 0,
        recordsFailed: 0,
        completedAt: now,
      },
    });
  }

  return {
    checkedAt: now.toISOString(),
    staleThresholdMinutes: STALE_AGENT_TASK_MINUTES,
    staleTasksReconciled: result.count,
    action: result.count > 0 ? 'stale_tasks_marked_failed' : 'no_repair_needed',
  };
}
