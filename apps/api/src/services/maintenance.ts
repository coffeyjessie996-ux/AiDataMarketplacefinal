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


export type MaintenanceFailureCategory =
  | 'authentication'
  | 'rate_limited'
  | 'timeout'
  | 'database'
  | 'upstream'
  | 'unknown';

export function classifyMaintenanceFailure(message: string | null): MaintenanceFailureCategory {
  const value = (message ?? '').toLowerCase();
  if (/\\b(401|403)\\b|unauthori[sz]ed|credential|invalid api key/.test(value)) return 'authentication';
  if (/\\b429\\b|rate.?limit|too many requests/.test(value)) return 'rate_limited';
  if (/timeout|timed out|etimedout|aborterror/.test(value)) return 'timeout';
  if (/database|prisma|postgres|connection refused|p1001|p1002/.test(value)) return 'database';
  if (/\\b5\\d\\d\\b|upstream|service unavailable|bad gateway/.test(value)) return 'upstream';
  return 'unknown';
}

export async function inspectRecentMaintenanceFailures(prisma: PrismaClient, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const failures = await prisma.agentTaskRun.findMany({
    where: { status: 'FAILED', startedAt: { gte: since } },
    orderBy: { startedAt: 'desc' },
    take: 20,
    select: { id: true, agentName: true, taskName: true, message: true, startedAt: true, completedAt: true, recordsFailed: true },
  });
  const categories: Record<MaintenanceFailureCategory, number> = {
    authentication: 0, rate_limited: 0, timeout: 0, database: 0, upstream: 0, unknown: 0,
  };
  const recommendations: Record<MaintenanceFailureCategory, string> = {
    authentication: 'Verify the source credentials and required API permissions; do not expose or log secrets.',
    rate_limited: 'Respect the source quota and retry window; do not bypass provider limits.',
    timeout: 'Check source/API responsiveness and request duration before considering a bounded retry.',
    database: 'Check database connectivity and schema health; do not run migrations automatically.',
    upstream: 'Check the provider status and retry only after confirming the operation is safe and idempotent.',
    unknown: 'Review the sanitized task message and investigate manually before taking action.',
  };
  const recentFailures = failures.map((failure) => {
    const category = classifyMaintenanceFailure(failure.message);
    categories[category] += 1;
    const safeMessage = (failure.message ?? 'No failure detail recorded.')
      .replace(/Bearer\\s+\\S+/gi, 'Bearer [redacted]')
      .replace(/(api[_-]?key[\\\"'\\s:=]+)[^\\s,\\\"']+/gi, '$1[redacted]')
      .slice(0, 240);
    return { ...failure, message: safeMessage, category, recommendedAction: recommendations[category] };
  });
  return { windowHours: 24, inspectedFailureCount: failures.length, categories, recentFailures };
}
