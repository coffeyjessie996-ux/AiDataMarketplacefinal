import express from 'express';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';

type AuthReq = express.Request & { user?: User };
type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

export function createDataBankRouter(prisma: PrismaClient, auth: express.RequestHandler) {
  const router = express.Router();
  router.use(auth);

  router.get('/summary', async (_req, res) => {
    try {
      const [totalRecords, sourceGroups, missingSupplierNames, latest] = await Promise.all([
        prisma.supplierResearchRecord.count(),
        prisma.supplierResearchRecord.groupBy({
          by: ['source'],
          _count: { _all: true },
          _max: { retrievedAt: true },
          orderBy: { source: 'asc' },
        }),
        prisma.supplierResearchRecord.count({ where: { supplierName: null } }),
        prisma.supplierResearchRecord.findFirst({
          orderBy: { retrievedAt: 'desc' },
          select: { retrievedAt: true },
        }),
      ]);

      return res.json({
        source: 'database',
        totalRecords,
        sourceCount: sourceGroups.length,
        recordsMissingSupplierName: missingSupplierNames,
        latestRetrievedAt: latest?.retrievedAt ?? null,
        sources: sourceGroups.map((group) => ({
          source: group.source,
          count: group._count._all,
          latestRetrievedAt: group._max.retrievedAt,
        })),
        note: 'Counts describe stored public research records, not verified suppliers, qualified sales leads, or revenue.',
      });
    } catch (error) {
      console.error('Data Bank summary failed', error);
      return res.status(500).json({ error: 'Unable to load Data Bank summary.' });
    }
  });

  router.get('/records', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const source = typeof req.query.source === 'string' ? req.query.source.trim().slice(0, 100) : '';
    const requestedPage = Number(req.query.page ?? 1);
    const requestedLimit = Number(req.query.limit ?? 25);
    const page = Number.isInteger(requestedPage) ? Math.max(1, Math.min(10000, requestedPage)) : 1;
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 25;
    const where = {
      ...(source ? { source } : {}),
      ...(q ? {
        OR: [
          { supplierName: { contains: q, mode: 'insensitive' as const } },
          { sourceRecordId: { contains: q, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    try {
      const [total, records] = await Promise.all([
        prisma.supplierResearchRecord.count({ where }),
        prisma.supplierResearchRecord.findMany({
          where,
          orderBy: [{ retrievedAt: 'desc' }, { createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            source: true,
            sourceRecordId: true,
            supplierName: true,
            awardAmount: true,
            sourceUrl: true,
            payload: true,
            retrievedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

      const data = records.map((record) => {
        const payload = asObject(record.payload);
        const usefulFields = [
          record.supplierName,
          payload.title,
          payload.description,
          payload.awardingAgency,
          payload.awardId,
          payload.noticeId,
          payload.naics,
          payload.supplierUei,
          payload.startDate,
          payload.endDate,
          payload.postedDate,
          payload.responseDeadline,
        ].filter(hasValue).length;
        return {
          ...record,
          awardAmount: record.awardAmount?.toString() ?? null,
          quality: {
            populatedFieldCount: usefulFields,
            hasSupplierName: Boolean(record.supplierName?.trim()),
            hasSourceLink: Boolean(record.sourceUrl),
            classification: record.source === 'sam.gov_opportunities'
              ? 'Government opportunity research'
              : 'Public supplier / award research',
          },
        };
      });

      return res.json({
        page,
        limit,
        total,
        pageCount: Math.ceil(total / limit),
        records: data,
      });
    } catch (error) {
      console.error('Data Bank records query failed', error);
      return res.status(500).json({ error: 'Unable to search Data Bank records.' });
    }
  });

  return router;
}
