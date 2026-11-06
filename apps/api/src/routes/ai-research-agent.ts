import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { analyzePublicResearchRecord } from '../services/ai-research-agent';
import { finishAgentTask, startAgentTask } from '../services/agent-activity';

function authorized(requestHeader: string | undefined, secret: string): boolean {
  if (!requestHeader?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(requestHeader.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function createAiResearchAgentRouter(prisma: PrismaClient) {
  const router = Router();

  // Called by Vercel Cron. It is intentionally small and budget-limited:
  // at most three new records per daily run, with no email or sales actions.
  router.post('/research-enrichment', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ error: 'AI research agent is not configured: CRON_SECRET is missing.' });
    if (!authorized(req.headers.authorization, secret)) return res.status(401).json({ error: 'Unauthorized AI research request.' });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI research agent is not configured: OPENAI_API_KEY is missing.' });

    const taskId = await startAgentTask(
      prisma,
      'OpenAI research analyst',
      'Analyze new Data Bank records and recommend evidence-based next steps',
      'ai_agent',
    );

    let processed = 0;
    let saved = 0;
    let failed = 0;
    try {
      const candidates = await prisma.supplierResearchRecord.findMany({
        orderBy: [{ retrievedAt: 'desc' }],
        take: 30,
        select: {
          id: true,
          source: true,
          sourceRecordId: true,
          supplierName: true,
          awardAmount: true,
          sourceUrl: true,
          payload: true,
        },
      });

      const pending = candidates.filter((record) => {
        const payload = asObject(record.payload);
        return !payload.aiResearchAnalysis;
      }).slice(0, 3);

      for (const record of pending) {
        processed += 1;
        try {
          const analysis = await analyzePublicResearchRecord({
            source: record.source,
            sourceRecordId: record.sourceRecordId,
            supplierName: record.supplierName,
            awardAmount: record.awardAmount?.toString() ?? null,
            sourceUrl: record.sourceUrl,
            payload: record.payload,
          });
          const existingPayload = asObject(record.payload);
          await prisma.supplierResearchRecord.update({
            where: { id: record.id },
            data: {
              payload: {
                ...existingPayload,
                aiResearchAnalysis: {
                  ...analysis,
                  analysisType: 'AI triage - not supplier verification',
                  model: process.env.OPENAI_RESEARCH_MODEL || 'gpt-4o-mini',
                  generatedAt: new Date().toISOString(),
                },
              },
            },
          });
          saved += 1;
        } catch (error) {
          failed += 1;
          console.error('AI research analysis failed for record', record.id, error);
        }
      }

      const status = processed > 0 && failed === processed ? 'FAILED' : 'COMPLETED';
      await finishAgentTask(prisma, taskId, status, {
        message: pending.length
          ? `AI research run finished: ${saved} records analyzed, ${failed} failed. Maximum three records are processed per daily run.`
          : 'AI research run checked the latest 30 records; no unanalyzed records were found.',
        recordsFetched: processed,
        recordsSaved: saved,
        recordsFailed: failed,
      });
      return res.json({
        ok: failed === 0,
        agent: 'OpenAI research analyst',
        processed,
        analyzed: saved,
        failed,
        dailyLimit: 3,
        note: 'AI triage is an aid to research only. It does not verify suppliers, create sales, send outreach, or count as revenue.',
      });
    } catch (error) {
      await finishAgentTask(prisma, taskId, 'FAILED', {
        message: 'AI research agent failed while loading or processing Data Bank records.',
        recordsFetched: processed,
        recordsSaved: saved,
        recordsFailed: failed + 1,
      });
      console.error('AI research agent run failed', error);
      return res.status(500).json({ error: 'AI research agent run failed.' });
    }
  });

  return router;
}
