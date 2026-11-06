import type { PrismaClient } from '@prisma/client';

export type AgentTaskOutcome = {
  message: string;
  recordsFetched?: number;
  recordsSaved?: number;
  recordsFailed?: number;
};

export async function startAgentTask(
  prisma: PrismaClient,
  agentName: string,
  taskName: string,
  agentType: 'automation' | 'ai_agent' = 'automation',
): Promise<string | null> {
  try {
    const task = await prisma.agentTaskRun.create({
      data: {
        agentName,
        agentType,
        taskName,
        status: 'RUNNING',
        message: 'Task started.',
      },
      select: { id: true },
    });
    return task.id;
  } catch (error) {
    // Activity logging must never stop a real collector from doing its work.
    console.warn('Could not record agent task start', error);
    return null;
  }
}

export async function finishAgentTask(
  prisma: PrismaClient,
  taskId: string | null,
  status: 'COMPLETED' | 'FAILED',
  outcome: AgentTaskOutcome,
): Promise<void> {
  if (!taskId) return;
  try {
    await prisma.agentTaskRun.update({
      where: { id: taskId },
      data: {
        status,
        message: outcome.message.slice(0, 500),
        recordsFetched: Math.max(0, Math.trunc(outcome.recordsFetched ?? 0)),
        recordsSaved: Math.max(0, Math.trunc(outcome.recordsSaved ?? 0)),
        recordsFailed: Math.max(0, Math.trunc(outcome.recordsFailed ?? 0)),
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.warn('Could not record agent task completion', error);
  }
}
