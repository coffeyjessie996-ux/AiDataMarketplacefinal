import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { analyzePublicResearchRecord } from '../services/ai-research-agent';
import { finishAgentTask, startAgentTask } from '../services/agent-activity';

const MAX_RECORDS_PER_RUN = 10;


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

function safeErrorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/(api[_-]?key["'\s:=]+)[^\s,"']+/gi, '$1[redacted]')
    .slice(0, 220);
}

function isInsufficientOpenAiQuota(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /insufficient_quota|no credits remaining/i.test(message);
}

export function createAiResearchAgentRouter(prisma: PrismaClient) {
  const router = Router();

  // Called by Vercel Cron, scheduled GitHub Actions, and Zapier. Accept GET for existing
  // schedules and POST for Zapier; reject all other methods. Each run is budget-limited
  // to at most ten new records, with no email or sales actions.
  router.all('/research-enrichment', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
    }
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ error: 'AI research agent is not configured: CRON_SECRET is missing.' });
    if (!authorized(req.headers.authorization, secret)) return res.status(401).json({ error: 'Unauthorized AI research request.' });

    const taskId = await startAgentTask(
      prisma,
      'Public-record research triage',
      'Analyze new Data Bank records using AI when available or a no-cost rules-based fallback',
      'ai_agent',
    );

    let processed = 0;
    let saved = 0;
    let failed = 0;
    const failureDetails: string[] = [];
    let blockedByQuota = false;
    try {
      const candidates = await prisma.supplierResearchRecord.findMany({
        orderBy: [{ retrievedAt: 'desc' }],
        take: 500,
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
      }).slice(0, MAX_RECORDS_PER_RUN);

      for (const record of pending) {
        processed += 1;
        try {
          const researchResult = await analyzePublicResearchRecord({
            source: record.source,
            sourceRecordId: record.sourceRecordId,
            supplierName: record.supplierName,
            awardAmount: record.awardAmount?.toString() ?? null,
            sourceUrl: record.sourceUrl,
            payload: record.payload,
          }, { forceRulesFallback: blockedByQuota });
          if (researchResult.fallbackReason === 'provider_quota') blockedByQuota = true;
          const analysisMetadata = {
            ...researchResult.analysis,
            analysisMethod: researchResult.analysisMethod,
            ...(researchResult.fallbackReason ? { fallbackReason: researchResult.fallbackReason } : {}),
            analysisType: researchResult.analysisMethod === 'openai'
              ? 'OpenAI-assisted public-record triage - not supplier verification'
              : 'Rules-based no-cost public-record triage - not supplier verification',
            model: researchResult.analysisMethod === 'openai'
              ? (process.env.OPENAI_RESEARCH_MODEL || 'gpt-4o-mini')
              : 'deterministic-rules-v1',
            generatedAt: new Date().toISOString(),
          };

          // Merge the analysis into the current JSONB value in PostgreSQL. This avoids
          // writing a stale payload snapshot over fields added by a concurrent collector.
          const updatedRows = await prisma.$executeRaw`
            UPDATE "SupplierResearchRecord"
            SET
              "payload" = COALESCE("payload", '{}'::jsonb) || jsonb_build_object(
                'aiResearchAnalysis', ${JSON.stringify(analysisMetadata)}::jsonb
              ),
              "updatedAt" = NOW()
            WHERE "id" = ${record.id}
          `;
          if (updatedRows !== 1) {
            throw new Error(`AI analysis persistence updated ${updatedRows} rows; expected exactly one.`);
          }

          // Do not increment the saved counter until a fresh database read confirms it.
          const persistedRecord = await prisma.supplierResearchRecord.findUnique({
            where: { id: record.id },
            select: { payload: true },
          });
          const persistedAnalysis = asObject(persistedRecord?.payload).aiResearchAnalysis;
          if (!persistedAnalysis || typeof persistedAnalysis !== 'object') {
            throw new Error('AI analysis write could not be verified after database read-back.');
          }
          saved += 1;
        } catch (error) {
          failed += 1;
          const detail = safeErrorSummary(error);
          if (failureDetails.length < 3) failureDetails.push(detail);
          console.error('AI research analysis failed for record', record.id, detail);
          if (isInsufficientOpenAiQuota(error)) {
            blockedByQuota = true;
            failureDetails[0] = 'OpenAI API quota is exhausted; stopped after the first failure to avoid repeated requests.';
            break;
          }
        }
      }

      const status = processed > 0 && failed === processed ? 'FAILED' : 'COMPLETED';
      await finishAgentTask(prisma, taskId, status, {
        message: pending.length
          ? `AI research run finished: ${saved} records analyzed, ${failed} failed. ${failureDetails.length ? `Failure detail: ${failureDetails[0]}` : ''} Maximum ${MAX_RECORDS_PER_RUN} records are processed per run.`
          : 'AI research run checked the latest 30 records; no unanalyzed records were found.',
        recordsFetched: processed,
        recordsSaved: saved,
        recordsFailed: failed,
      });
      return res.json({
        ok: failed === 0,
        agent: 'Public-record research triage',
        processed,
        analyzed: saved,
        failed,
        blockedByQuota,
        perRunLimit: MAX_RECORDS_PER_RUN,
        note: 'AI triage is an aid to research only. It does not verify suppliers, create sales, send outreach, or count as revenue.',
      });
    } catch (error) {
      await finishAgentTask(prisma, taskId, 'FAILED', {
        message: `AI research agent failed while loading or processing Data Bank records: ${safeErrorSummary(error)}`,
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
