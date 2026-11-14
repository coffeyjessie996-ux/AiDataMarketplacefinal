import type { Prisma, PrismaClient } from '@prisma/client';

type ResearchRecordInput = {
  source: string;
  sourceRecordId: string;
  supplierName: string | null;
  awardAmount: number | null;
  sourceUrl: string;
  payload: Record<string, unknown>;
  retrievedAt: Date;
};

/**
 * Atomically refresh public-source fields without erasing analysis or other
 * metadata written by concurrent agents. JSONB concatenation happens inside
 * PostgreSQL, so a stale read from a collector cannot overwrite a new analysis.
 */
export async function upsertResearchRecordPreservingAnalysis(
  prisma: PrismaClient,
  record: ResearchRecordInput,
): Promise<void> {
  const updateExisting = () => prisma.$executeRaw`
    UPDATE "SupplierResearchRecord"
    SET
      "supplierName" = ${record.supplierName},
      "awardAmount" = ${record.awardAmount}::numeric,
      "sourceUrl" = ${record.sourceUrl},
      "payload" = COALESCE("payload", '{}'::jsonb) || ${JSON.stringify(record.payload)}::jsonb,
      "retrievedAt" = ${record.retrievedAt},
      "updatedAt" = NOW()
    WHERE "source" = ${record.source}
      AND "sourceRecordId" = ${record.sourceRecordId}
  `;

  if (await updateExisting() > 0) return;

  try {
    await prisma.supplierResearchRecord.create({
      data: {
        source: record.source,
        sourceRecordId: record.sourceRecordId,
        supplierName: record.supplierName,
        awardAmount: record.awardAmount,
        sourceUrl: record.sourceUrl,
        payload: record.payload as Prisma.InputJsonValue,
        retrievedAt: record.retrievedAt,
      },
    });
  } catch (error) {
    // Another collector may have inserted the same source row after our UPDATE.
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')) {
      throw error;
    }
    if (await updateExisting() === 0) throw error;
  }
}
