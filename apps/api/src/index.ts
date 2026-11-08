import './instrument';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import Stripe from 'stripe';
import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { scrapeSources } from './services/scraper';
import { prisma } from './lib/prisma';
import { User } from './types';
import { createPipelineRouter } from './routes/pipeline';
import { createCronRouter } from './routes/cron';
import { createDataBankRouter } from './routes/data-bank';
import { createAgentsRouter } from './routes/agents';
import { createAiResearchAgentRouter } from './routes/ai-research-agent';
import { createOperationsRouter } from './routes/operations';
import { createAuctionsRouter } from './routes/auctions';
import { finishAgentTask, startAgentTask } from './services/agent-activity';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({
  verify: (req, _res, buffer) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  },
}));

// The web app calls `/api/*` (rewritten to this service), while routes are defined without the prefix.
app.use((req, _res, next) => {
  if (req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?')) {
    req.url = req.url.slice(4) || '/';
  }
  next();
});

function hasValidDatabaseUrl() {
  const url = process.env.DATABASE_URL || '';
  return url.startsWith('postgresql://') || url.startsWith('postgres://');
}

// Do not let a missing/invalid DATABASE_URL look like an empty, successful marketplace.
// Keep /health available so deployment diagnostics can report the configuration state.
app.use((req, res, next) => {
  if (req.path === '/health' || hasValidDatabaseUrl()) return next();
  return res.status(503).json({
    error: 'Database not configured: set DATABASE_URL to a valid PostgreSQL connection string to load live marketplace figures.',
  });
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret';

function makeUserToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

function decodeUserToken(token: string) {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function getAuthenticatedUserId(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return decodeUserToken(authHeader.replace('Bearer ', '').trim());
  }

  return null;
}

const serializeUser = (user: {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  passwordHash?: string;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role.toLowerCase(),
  status: user.status.toLowerCase(),
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

const serializeDataset = (dataset: {
  id: string;
  sellerId: string;
  title: string;
  category: string;
  description: string;
  priceCents: number;
  qualityScore: number;
  licenseType: string;
  sourceCount: number;
  status: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: dataset.id,
  sellerId: dataset.sellerId,
  title: dataset.title,
  category: dataset.category,
  description: dataset.description,
  priceCents: dataset.priceCents,
  qualityScore: dataset.qualityScore,
  licenseType: dataset.licenseType.toLowerCase(),
  sourceCount: dataset.sourceCount,
  status: dataset.status.toLowerCase(),
  tags: dataset.tags,
  createdAt: dataset.createdAt.toISOString(),
  updatedAt: dataset.updatedAt.toISOString(),
});

const serializeWallet = (wallet: {
  id: string;
  userId: string;
  balanceCents: number;
  currency: string;
  status: string;
  createdAt: Date;
}) => ({
  id: wallet.id,
  userId: wallet.userId,
  balanceCents: wallet.balanceCents,
  currency: wallet.currency,
  status: wallet.status.toLowerCase(),
  createdAt: wallet.createdAt.toISOString(),
});

const serializePayout = (payout: {
  id: string;
  userId: string;
  walletAccountId: string;
  amountCents: number;
  method: string;
  destinationAccount: string;
  status: string;
  requestedAt: Date;
  processedAt?: Date | null;
}) => ({
  id: payout.id,
  userId: payout.userId,
  walletAccountId: payout.walletAccountId,
  amountCents: payout.amountCents,
  method: payout.method.toLowerCase(),
  destinationAccount: payout.destinationAccount,
  status: payout.status.toLowerCase(),
  requestedAt: payout.requestedAt.toISOString(),
  processedAt: payout.processedAt ? payout.processedAt.toISOString() : undefined,
});

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    (req as express.Request & { user?: User }).user = serializeUser(user) as User;
    return next();
  } catch (error) {
    console.error('requireAuth failed', error);
    return res.status(500).json({ error: 'Authentication failed.' });
  }
}

function requireRole(roles: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as express.Request & { user?: User }).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
}

app.use('/pipeline', createPipelineRouter(prisma, requireAuth));
app.use('/cron', createCronRouter(prisma));
app.use('/cron/ai', createAiResearchAgentRouter(prisma));
app.use('/data-bank', createDataBankRouter(prisma, requireAuth));
app.use('/agents', createAgentsRouter(prisma, requireAuth));
app.use('/operations', createOperationsRouter(prisma, requireAuth));
app.use('/auctions', createAuctionsRouter(prisma, requireAuth));

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['buyer', 'seller']).default('buyer'),
});

const datasetSchema = z.object({
  title: z.string().min(5),
  category: z.string().min(2),
  description: z.string().min(20),
  priceCents: z.number().int().positive(),
  qualityScore: z.number().int().min(0).max(100),
  licenseType: z
    .enum(['commercial', 'personal', 'enterprise', 'restricted'])
    .default('commercial'),
  sourceCount: z.number().int().min(1).default(1),
  tags: z.array(z.string()).default([]),
  status: z.enum(['draft', 'review', 'published', 'archived']).default('published'),
});

const payoutSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(['bank_transfer', 'wire', 'stripe']).default('bank_transfer'),
  destinationAccount: z.string().min(4),
});

// Seed data is explicitly marked by its local-only email domain and sample labels.
// Exclude it from public/live metrics so test rows cannot look like real sales.
const nonDemoDatasetFilter = {
  seller: { isNot: { email: { endsWith: '@local.test' } } },
  title: { not: { contains: '(Sample)' } },
};
const nonDemoOrderFilter = {
  buyer: { isNot: { email: { endsWith: '@local.test' } } },
  dataset: {
    is: {
      seller: { isNot: { email: { endsWith: '@local.test' } } },
      title: { not: { contains: '(Sample)' } },
    },
  },
};
const nonDemoPaidOrderFilter = nonDemoOrderFilter;
const nonDemoPayoutFilter = {
  user: { isNot: { email: { endsWith: '@local.test' } } },
};
const nonDemoUserFilter = {
  email: { not: { endsWith: '@local.test' } },
};

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-data-marketplace-api',
    databaseConfigured: hasValidDatabaseUrl(),
    timestamp: new Date().toISOString(),
  });
});

app.post('/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { name, email, password, role } = parsed.data;
  const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existingUser) {
    return res.status(409).json({ error: 'User already exists.' });
  }

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
        role: role.toUpperCase() as any,
        status: 'ACTIVE',
      },
    });

    await prisma.walletAccount.create({
      data: {
        userId: user.id,
        balanceCents: 0,
        currency: 'USD',
        status: 'ACTIVE',
      },
    });

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.toLowerCase(),
        status: user.status.toLowerCase(),
      },
      token: makeUserToken(user.id),
    });
  } catch (error) {
    console.error('register failed', error);
    return res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/auth/login', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.toLowerCase(),
      status: user.status.toLowerCase(),
    },
    token: makeUserToken(user.id),
  });
});

app.get('/auth/me', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const wallet = await prisma.walletAccount.findUnique({ where: { userId: user.id } });
  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
    wallet: wallet ? serializeWallet(wallet) : null,
  });
});

app.get('/users', requireAuth, requireRole(['admin']), async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  return res.json({ users: users.map((user) => serializeUser(user)) });
});

app.get('/datasets', async (req, res) => {
  const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
  const normalizedQuery = rawQuery.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\+?\d[\d ()-]{7,}\d/g, '[phone]')
    .replace(/\s+/g, ' ').toLowerCase().slice(0, 80);
  const where: any = {
    AND: [
      { status: 'PUBLISHED' },
      nonDemoDatasetFilter,
      ...(rawQuery.length >= 2 ? [{
        OR: [
          { title: { contains: rawQuery, mode: 'insensitive' } },
          { category: { contains: rawQuery, mode: 'insensitive' } },
          { description: { contains: rawQuery, mode: 'insensitive' } },
          { tags: { has: rawQuery.toLowerCase() } },
        ],
      }] : []),
    ],
  };

  try {
    const datasets = await prisma.dataset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    if (normalizedQuery.length >= 2) {
      // Store search intent only: no IP address, email, account ID, or browser fingerprint.
      await prisma.buyerDemandEvent.create({
        data: {
          query: normalizedQuery,
          category: datasets.find((dataset) => dataset.category.toLowerCase() === normalizedQuery)?.category ?? null,
          resultCount: datasets.length,
        },
      });
    }
    return res.json({
      datasets: datasets.map(serializeDataset),
      search: rawQuery.length >= 2 ? { query: normalizedQuery, resultCount: datasets.length, tracked: normalizedQuery.length >= 2 } : null,
    });
  } catch (error) {
    console.error('Marketplace dataset search failed', error);
    return res.status(500).json({ error: 'Unable to search marketplace datasets.' });
  }
});


// Public GovCon buyer inquiry capture. Contact details are stored only when a visitor
// explicitly submits this form and confirms permission to be contacted.
const buyerInquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  company: z.string().trim().min(2).max(160),
  interest: z.enum(['supplier-intelligence', 'engineering-awards', 'agency-trends', 'custom-research']),
  message: z.string().trim().max(1500).optional().default(''),
  consent: z.literal(true),
  website: z.string().max(0).optional().default(''),
});

app.post('/buyer-inquiries', async (req, res) => {
  const parsed = buyerInquirySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please complete the required fields and confirm contact permission.' });
  if (parsed.data.website) return res.status(400).json({ error: 'Invalid submission.' });

  const email = parsed.data.email.toLowerCase();
  try {
    const recent = await prisma.buyerDemandEvent.count({
      where: { buyerEmail: email, status: 'NEW', createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recent >= 3) return res.status(429).json({ error: 'We have received your recent requests. Please wait before submitting again.' });

    await prisma.buyerDemandEvent.create({
      data: {
        query: 'buyer_inquiry',
        category: 'government-contracting',
        resultCount: 0,
        buyerName: parsed.data.name,
        buyerEmail: email,
        companyName: parsed.data.company,
        interest: parsed.data.interest,
        message: parsed.data.message || null,
        status: 'NEW',
        contactConsentAt: new Date(),
      },
    });
    return res.status(201).json({ message: 'Your request has been received. Our team can follow up using the contact details you provided.' });
  } catch (error) {
    console.error('Buyer inquiry submission failed', error);
    return res.status(500).json({ error: 'We could not save your request. Please try again later.' });
  }
});


app.get('/buyer-inquiries', requireAuth, requireRole(['seller', 'admin']), async (_req, res) => {
  try {
    const inquiries = await prisma.buyerDemandEvent.findMany({
      where: { status: { in: ['NEW', 'CONTACTED', 'CLOSED'] }, buyerEmail: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, buyerName: true, buyerEmail: true, companyName: true,
        interest: true, message: true, status: true, createdAt: true,
      },
    });
    return res.json({ inquiries });
  } catch (error) {
    console.error('Buyer inquiry inbox failed', error);
    return res.status(500).json({ error: 'Unable to load buyer inquiries.' });
  }
});

app.patch('/buyer-inquiries/:id', requireAuth, requireRole(['seller', 'admin']), async (req, res) => {
  const parsed = z.object({ status: z.enum(['NEW', 'CONTACTED', 'CLOSED']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a valid inquiry status.' });
  try {
    const result = await prisma.buyerDemandEvent.updateMany({
      where: { id: String(req.params.id), buyerEmail: { not: null }, status: { in: ['NEW', 'CONTACTED', 'CLOSED'] } },
      data: { status: parsed.data.status },
    });
    if (!result.count) return res.status(404).json({ error: 'Buyer inquiry not found.' });
    return res.json({ status: parsed.data.status });
  } catch (error) {
    console.error('Buyer inquiry update failed', error);
    return res.status(500).json({ error: 'Unable to update buyer inquiry.' });
  }
});

// Aggregate real marketplace search activity. Search phrases are collected without IPs,
// contact details, account IDs, or browser fingerprints.
app.get('/demand/summary', requireAuth, requireRole(['seller', 'admin']), async (_req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalSearches, topQueries, categoryDemand, zeroResultSearches] = await Promise.all([
      prisma.buyerDemandEvent.count({ where: { status: 'SEARCH', createdAt: { gte: since } } }),
      prisma.buyerDemandEvent.groupBy({
        by: ['query'],
        where: { status: 'SEARCH', createdAt: { gte: since } },
        _count: { _all: true },
        _avg: { resultCount: true },
        orderBy: { _count: { query: 'desc' } },
        take: 10,
      }),
      prisma.buyerDemandEvent.groupBy({
        by: ['category'],
        where: { status: 'SEARCH', createdAt: { gte: since }, category: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
        take: 8,
      }),
      prisma.buyerDemandEvent.count({ where: { status: 'SEARCH', createdAt: { gte: since }, resultCount: 0 } }),
    ]);

    return res.json({
      source: 'recorded_marketplace_searches',
      windowDays: 30,
      totalSearches,
      zeroResultSearches,
      topQueries: topQueries.map((item) => ({
        query: item.query,
        searches: item._count._all,
        averageResults: Math.round(item._avg.resultCount ?? 0),
      })),
      categoryDemand: categoryDemand.map((item) => ({
        category: item.category,
        searches: item._count._all,
      })),
      note: 'These are actual search events recorded by the marketplace, not estimated market size, purchase intent, or sales.',
    });
  } catch (error) {
    console.error('Buyer demand summary failed', error);
    return res.status(500).json({ error: 'Unable to load buyer demand intelligence.' });
  }
});

// Pricing guidance uses current published competitor listings and recorded marketplace searches.
// It is advisory only: it never changes a dataset price or publishes a listing.
app.get('/pricing/recommendations', requireAuth, requireRole(['seller', 'admin']), async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  const isAdmin = user.role === 'admin';
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    const [datasets, competitorDatasets, demandEvents] = await Promise.all([
      prisma.dataset.findMany({
        where: {
          AND: [
            isAdmin ? { status: 'PUBLISHED' } : { sellerId: user.id, status: 'PUBLISHED' },
            nonDemoDatasetFilter,
          ],
        },
        include: {
          orders: {
            where: { status: 'PAID' },
            select: { totalCents: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.dataset.findMany({
        where: { AND: [{ status: 'PUBLISHED' }, nonDemoDatasetFilter] },
        select: { id: true, sellerId: true, category: true, priceCents: true },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      prisma.buyerDemandEvent.findMany({
        where: { status: 'SEARCH', createdAt: { gte: since } },
        select: { query: true, resultCount: true },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
    ]);

    const tokenize = (value: string) => value.toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !['the', 'and', 'for', 'with', 'from', 'data'].includes(word));
    const median = (values: number[]) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
    };

    const recommendations = datasets.map((dataset) => {
      const comparablePrices = competitorDatasets
        .filter((candidate) =>
          candidate.id !== dataset.id &&
          candidate.sellerId !== dataset.sellerId &&
          candidate.category.trim().toLowerCase() === dataset.category.trim().toLowerCase(),
        )
        .map((candidate) => candidate.priceCents)
        .filter((price) => Number.isInteger(price) && price > 0);
      const benchmarkMedianCents = median(comparablePrices);
      const qualityAdjustmentPercent = Math.max(-10, Math.min(10, Math.round((dataset.qualityScore - 70) * 0.2)));
      const suggestedPriceCents = benchmarkMedianCents === null
        ? null
        : Math.max(100, Math.round(benchmarkMedianCents * (1 + qualityAdjustmentPercent / 100)));
      const productTerms = new Set(tokenize(dataset.title + ' ' + dataset.category));
      const demandSearches = demandEvents.filter((event) =>
        tokenize(event.query).some((term) => productTerms.has(term)),
      ).length;
      const paidOrderValueCents = dataset.orders.reduce((total, order) => total + order.totalCents, 0);

      return {
        datasetId: dataset.id,
        title: dataset.title,
        category: dataset.category,
        currentPriceCents: dataset.priceCents,
        qualityScore: dataset.qualityScore,
        benchmarkMedianCents,
        suggestedPriceCents,
        qualityAdjustmentPercent,
        comparableListings: comparablePrices.length,
        demandSearchesLast30Days: demandSearches,
        paidOrdersRecorded: dataset.orders.length,
        paidOrderValueCents,
        confidence: comparablePrices.length >= 5 ? 'high' : comparablePrices.length >= 3 ? 'medium' : 'low',
        note: suggestedPriceCents === null
          ? 'Not enough published competitor listings in this category to calculate a responsible price benchmark.'
          : 'Suggestion is based on the median price of other sellers’ published listings in the same category, adjusted modestly for the stored quality score.',
      };
    });

    return res.json({
      source: 'published_marketplace_listings_and_recorded_searches',
      windowDays: 30,
      recommendations,
      note: 'Search counts are interest signals, not purchase intent. Paid-order counts reflect database records marked PAID and are not payment-provider settlement verification. Suggestions never change prices automatically.',
    });
  } catch (error) {
    console.error('Pricing recommendations failed', error);
    return res.status(500).json({ error: 'Unable to calculate pricing recommendations from marketplace data.' });
  }
});

app.get('/datasets/:id', async (req, res) => {
  const dataset = await prisma.dataset.findFirst({
    where: { AND: [{ id: req.params.id, status: 'PUBLISHED' }, nonDemoDatasetFilter] },
  });
  if (!dataset) return res.status(404).json({ error: 'Dataset not found.' });
  return res.json({ dataset: serializeDataset(dataset) });
});

app.post('/datasets', requireAuth, requireRole(['seller', 'admin']), async (req, res) => {
  const parsed = datasetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const dataset = await prisma.dataset.create({
    data: {
      sellerId: user.id,
      title: parsed.data.title,
      category: parsed.data.category,
      description: parsed.data.description,
      priceCents: parsed.data.priceCents,
      qualityScore: parsed.data.qualityScore,
      licenseType: parsed.data.licenseType.toUpperCase() as any,
      sourceCount: parsed.data.sourceCount,
      status: parsed.data.status.toUpperCase() as any,
      tags: parsed.data.tags,
    },
  });

  return res.status(201).json({ dataset: serializeDataset(dataset) });
});

// Public-page research ingestion. Successful snapshots are persisted for later
// deduplication, quality review, and dataset curation; they are NOT auto-published.
app.post('/scrapers/start', requireAuth, async (req, res) => {
  const requestSchema = z.object({
    urls: z.array(z.string().url().max(2048)).min(1).max(20),
  });
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Provide between 1 and 20 valid public HTTP/HTTPS URLs.',
      details: parsed.error.flatten(),
    });
  }

  const taskId = await startAgentTask(prisma, 'Public web scraper', 'Fetch and store submitted public web pages');
  try {
    const results = await scrapeSources(parsed.data.urls);
    const successfulResults = results.filter(
      (record): record is typeof record & { sourceUrl: string; textSnippet: string } =>
        typeof record.sourceUrl === 'string' &&
        typeof record.textSnippet === 'string' &&
        !('error' in record),
    );

    const saved = await Promise.all(successfulResults.map(async (record) => {
      const sourceRecordId = createHash('sha256')
        .update(record.sourceUrl)
        .digest('hex');
      const payload = JSON.parse(JSON.stringify({
        title: record.title,
        textSnippet: record.textSnippet,
        contentType: record.contentType,
        status: record.status,
        fetchedAt: record.fetchedAt,
        extractionMethod: record.extractionMethod,
      }));

      return prisma.supplierResearchRecord.upsert({
        where: {
          source_sourceRecordId: {
            source: 'public_web_scrape',
            sourceRecordId,
          },
        },
        create: {
          source: 'public_web_scrape',
          sourceRecordId,
          sourceUrl: record.sourceUrl,
          payload,
        },
        update: {
          sourceUrl: record.sourceUrl,
          payload,
          retrievedAt: new Date(),
        },
        select: { id: true },
      });
    }));

    await finishAgentTask(prisma, taskId, 'COMPLETED', {
      message: `Public web scrape completed: ${saved.length} pages saved, ${results.length - successfulResults.length} failed.`,
      recordsFetched: results.length, recordsSaved: saved.length, recordsFailed: results.length - successfulResults.length,
    });
    return res.status(200).json({
      success: true,
      requested: parsed.data.urls.length,
      scraped: results.length,
      saved: saved.length,
      failed: results.length - successfulResults.length,
      results,
      note: 'Successful public-page snapshots are saved for review. They are not verified supplier contacts or published products.',
    });
  } catch (error) {
    await finishAgentTask(prisma, taskId, 'FAILED', { message: 'Public web scraper failed before completion.' });
    console.error('Scraper ingestion failed', error);
    return res.status(500).json({
      error: 'Scraper ingestion failed. No dataset was published.',
    });
  }
});


// Public-source supplier intelligence: US federal contract awards from USAspending.gov.
// Results retain the official source URL and retrieval timestamp; this endpoint does not
// claim that records are independently verified or that a sale has occurred.
app.get('/research/suppliers/federal-awards', requireAuth, async (req, res) => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStartDate = new Date(today);
  defaultStartDate.setUTCDate(defaultStartDate.getUTCDate() - 90);
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : defaultStartDate.toISOString().slice(0, 10);
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : defaultEnd;
  const requestedLimit = Number(req.query.limit ?? 50);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 50;

  if (!datePattern.test(startDate) || !datePattern.test(endDate) || startDate > endDate) {
    return res.status(400).json({ error: 'Use valid YYYY-MM-DD startDate and endDate values, with startDate no later than endDate.' });
  }

  try {
    const response = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        filters: {
          time_period: [{ start_date: startDate, end_date: endDate }],
          award_type_codes: ['A', 'B', 'C', 'D'],
        },
        fields: [
          'Award ID', 'Recipient Name', 'Award Amount', 'Start Date', 'End Date',
          'Awarding Agency', 'Description', 'Place of Performance State Code', 'NAICS', 'Recipient UEI',
        ],
        page: 1,
        limit,
        sort: 'Award Amount',
        order: 'desc',
      }),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'USAspending.gov returned an error.', sourceStatus: response.status });
    }

    const payload = await response.json() as { results?: Array<Record<string, unknown>>; page_metadata?: unknown };
    const sourceValue = (row: Record<string, unknown>, label: string, normalized: string) => row[label] ?? row[normalized] ?? null;
    const retrievedAt = new Date().toISOString();
    const records = (Array.isArray(payload.results) ? payload.results : []).map((row) => ({
      awardId: sourceValue(row, 'Award ID', 'award_id'),
      supplierName: sourceValue(row, 'Recipient Name', 'recipient_name'),
      awardAmount: sourceValue(row, 'Award Amount', 'award_amount'),
      startDate: sourceValue(row, 'Start Date', 'start_date'),
      endDate: sourceValue(row, 'End Date', 'end_date'),
      awardingAgency: sourceValue(row, 'Awarding Agency', 'awarding_agency_name'),
      description: sourceValue(row, 'Description', 'description'),
      performanceState: sourceValue(row, 'Place of Performance State Code', 'place_of_performance_state_code'),
      naics: sourceValue(row, 'NAICS', 'naics'),
      supplierUei: sourceValue(row, 'Recipient UEI', 'recipient_uei'),
      sourceUrl: 'https://www.usaspending.gov/',
      retrievedAt,
    }));

    let persistedCount = 0;
    for (const record of records) {
      const sourceRecordId = String(record.awardId ?? '').trim();
      if (!sourceRecordId) continue;

      const amount = Number(record.awardAmount);
      await prisma.supplierResearchRecord.upsert({
        where: {
          source_sourceRecordId: {
            source: 'usaspending.gov',
            sourceRecordId,
          },
        },
        create: {
          source: 'usaspending.gov',
          sourceRecordId,
          supplierName: typeof record.supplierName === 'string' ? record.supplierName : null,
          awardAmount: Number.isFinite(amount) && amount >= 0 ? amount : null,
          sourceUrl: String(record.sourceUrl),
          payload: record as any,
          retrievedAt: new Date(retrievedAt),
        },
        update: {
          supplierName: typeof record.supplierName === 'string' ? record.supplierName : null,
          awardAmount: Number.isFinite(amount) && amount >= 0 ? amount : null,
          sourceUrl: String(record.sourceUrl),
          payload: record as any,
          retrievedAt: new Date(retrievedAt),
        },
      });
      persistedCount += 1;
    }

    return res.json({
      source: 'USAspending.gov',
      sourceUrl: 'https://api.usaspending.gov/api/v2/search/spending_by_award/',
      retrievedAt,
      dateRange: { startDate, endDate },
      count: records.length,
      persistedCount,
      records,
      note: 'Public federal award data for supplier research. Check the source record before making commercial decisions; results are not independently verified and are not saved as a marketplace product by this endpoint.',
    });
  } catch (error) {
    console.error('USAspending supplier research failed', error);
    return res.status(502).json({ error: 'Unable to retrieve supplier records from USAspending.gov right now.' });
  }
});

app.get('/research/suppliers/federal-awards/saved', requireAuth, async (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 50);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 50;
  const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';

  try {
    const records = await prisma.supplierResearchRecord.findMany({
      where: {
        source: 'usaspending.gov',
        ...(search ? { supplierName: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { retrievedAt: 'desc' },
      take: limit,
    });

    return res.json({
      source: 'USAspending.gov',
      count: records.length,
      records: records.map((record) => ({
        id: record.id,
        source: record.source,
        sourceRecordId: record.sourceRecordId,
        supplierName: record.supplierName,
        awardAmount: record.awardAmount?.toString() ?? null,
        sourceUrl: record.sourceUrl,
        payload: record.payload,
        retrievedAt: record.retrievedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Saved supplier research lookup failed', error);
    return res.status(500).json({ error: 'Unable to read saved supplier records.' });
  }
});

app.get('/wallet', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const wallet = await prisma.walletAccount.findUnique({ where: { userId: user.id } });
  return res.json({ wallet: wallet ? serializeWallet(wallet) : null });
});

app.post('/wallet/payout', requireAuth, async (_req, res) => {
  // Payout integrations are currently simulated. Do not debit wallets or imply money will be sent.
  return res.status(503).json({
    error: 'Payouts are not enabled yet. A verified payout provider integration is required.',
  });
});

const stripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey);
};

// Stripe Checkout is gated until secure dataset delivery and its end-to-end tests are verified.
app.get('/orders/checkout-session/:sessionId', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  const stripe = stripeClient();
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured on the server.' });
  try {
    const session = await stripe.checkout.sessions.retrieve(String(req.params.sessionId));
    const orderId = session.metadata?.orderId;
    if (!orderId || session.metadata?.buyerId !== user.id) {
      return res.status(404).json({ error: 'Checkout session not found for this account.' });
    }
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.buyerId !== user.id ||
        session.metadata?.datasetId !== order.datasetId ||
        session.currency?.toLowerCase() !== order.currency.toLowerCase() ||
        session.amount_total !== order.totalCents) {
      return res.status(404).json({ error: 'Checkout session does not match an order for this account.' });
    }

    if (session.payment_status === 'paid' && order.status === 'PENDING') {
      await prisma.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'PAID' } });
    } else if ((session.status === 'expired' || session.payment_status === 'unpaid') && order.status === 'PENDING' && session.status === 'expired') {
      await prisma.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } });
    }

    const current = await prisma.order.findUnique({ where: { id: order.id } });
    return res.json({
      orderId: order.id,
      status: current?.status.toLowerCase() ?? 'pending',
      paymentStatus: session.payment_status,
      totalCents: order.totalCents,
      currency: order.currency,
    });
  } catch (error) {
    console.error('Stripe Checkout session verification failed', error);
    return res.status(502).json({ error: 'Unable to verify this Stripe Checkout session.' });
  }
});

app.get('/orders/:id/download', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const order = await prisma.order.findUnique({
      where: { id: String(req.params.id) },
      include: { dataset: { select: { id: true, title: true, sellerId: true, status: true, licenseType: true, tags: true } } },
    });
    if (!order || order.buyerId !== user.id) return res.status(404).json({ error: 'Paid order not found for this account.' });
    if (order.status !== 'PAID') return res.status(403).json({ error: 'The download unlocks only after Stripe confirms payment.' });
    if (order.dataset.status !== 'PUBLISHED' || order.dataset.licenseType === 'RESTRICTED' || !order.dataset.tags.includes('factory:v1')) {
      return res.status(409).json({ error: 'This dataset is not currently approved for delivery.' });
    }
    const recordIds = order.dataset.tags
      .filter((tag) => tag.startsWith('source-record-id:'))
      .map((tag) => tag.slice('source-record-id:'.length))
      .filter(Boolean);
    if (recordIds.length === 0) return res.status(409).json({ error: 'No source records are attached to this dataset.' });

    const records = await prisma.supplierResearchRecord.findMany({
      where: { id: { in: recordIds } },
      orderBy: [{ retrievedAt: 'desc' }, { createdAt: 'desc' }],
      select: { source: true, sourceRecordId: true, supplierName: true, awardAmount: true, sourceUrl: true, payload: true, retrievedAt: true },
    });
    if (records.length !== recordIds.length) return res.status(409).json({ error: 'Some source records are no longer available; contact support.' });

    const payloadFields = ['title', 'description', 'awardingAgency', 'awardId', 'noticeId', 'naics', 'supplierUei', 'startDate', 'endDate', 'postedDate', 'responseDeadline'];
    const headers = ['source', 'source_record_id', 'supplier_name', 'award_amount_usd', 'source_url', 'retrieved_at', ...payloadFields];
    const csvCell = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = records.map((record) => {
      const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
        ? record.payload as Record<string, unknown>
        : {};
      return [
        record.source, record.sourceRecordId, record.supplierName, record.awardAmount?.toString() ?? '',
        record.sourceUrl, record.retrievedAt.toISOString(), ...payloadFields.map((field) => payload[field]),
      ].map(csvCell).join(',');
    });
    const csv = [headers.map(csvCell).join(','), ...rows].join('\\r\\n');
    const safeName = order.dataset.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'dataset';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(csv);
  } catch (error) {
    console.error('Paid dataset download failed', error);
    return res.status(500).json({ error: 'Unable to prepare this dataset download.' });
  }
});

app.get('/orders/:id', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const order = await prisma.order.findUnique({
      where: { id: String(req.params.id) },
      include: { dataset: { select: { id: true, title: true, sellerId: true, tags: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.buyerId !== user.id && order.dataset.sellerId !== user.id && user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not allowed to view this order.' });
    }
    return res.json({
      order: {
        id: order.id,
        status: order.status.toLowerCase(),
        totalCents: order.totalCents,
        currency: order.currency,
        datasetId: order.datasetId,
        datasetTitle: order.dataset.title,
        downloadAvailable: order.status === 'PAID' && order.dataset.tags.includes('factory:v1'),
      },
    });
  } catch (error) {
    console.error('Order status lookup failed', error);
    return res.status(500).json({ error: 'Unable to load order status.' });
  }
});

app.post('/orders', requireAuth, async (req, res) => {
  const parsed = z.object({ datasetId: z.string().min(1).max(128) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A valid datasetId is required.' });

  if (process.env.STRIPE_CHECKOUT_ENABLED !== 'true') {
    return res.status(503).json({
      error: 'Checkout is not enabled yet. Secure dataset delivery must be ready before buyers can be charged.',
    });
  }

  const stripe = stripeClient();
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured on the server.' });

  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const dataset = await prisma.dataset.findFirst({
      where: {
        AND: [
          { id: parsed.data.datasetId, status: 'PUBLISHED', priceCents: { gt: 0 }, licenseType: { not: 'RESTRICTED' }, tags: { has: 'factory:v1' } },
          nonDemoDatasetFilter,
        ],
      },
      include: {
        seller: { select: { email: true } },
      },
    });
    if (!dataset) return res.status(404).json({ error: 'This dataset is not available for purchase.' });
    const includedRecordIds = dataset.tags
      .filter((tag) => tag.startsWith('source-record-id:'))
      .map((tag) => tag.slice('source-record-id:'.length));
    if (includedRecordIds.length === 0) {
      return res.status(409).json({ error: 'This listing has no attached source records and cannot be delivered.' });
    }
    if (new Set(includedRecordIds).size !== includedRecordIds.length) {
      return res.status(409).json({ error: 'This listing contains duplicate source references and cannot be sold yet.' });
    }
    if (!dataset.tags.includes('license-review-status:seller_reviewed') ||
        !dataset.tags.some((tag) => tag.startsWith('license-review-evidence:'))) {
      return res.status(409).json({ error: 'Seller source-rights review and evidence are required before checkout.' });
    }
    const availableRecordCount = await prisma.supplierResearchRecord.count({
      where: { id: { in: includedRecordIds }, source: 'usaspending.gov' },
    });
    if (availableRecordCount !== includedRecordIds.length) {
      return res.status(409).json({ error: 'This delivery currently supports only complete USAspending record sets.' });
    }
    if (dataset.sellerId === user.id) return res.status(400).json({ error: 'You cannot purchase your own dataset.' });

    const order = await prisma.order.create({
      data: {
        buyerId: user.id,
        datasetId: dataset.id,
        totalCents: dataset.priceCents,
        currency: 'USD',
        status: 'PENDING',
      },
    });

    const baseUrl = (process.env.FRONTEND_URL || 'https://aidatamarketplacefinal.vercel.app').replace(/\/$/, '');
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: dataset.priceCents,
            product_data: {
              name: dataset.title.slice(0, 250),
              description: dataset.description.slice(0, 500),
            },
          },
        }],
        client_reference_id: order.id,
        metadata: { orderId: order.id, datasetId: dataset.id, buyerId: user.id },
        success_url: `${baseUrl}/dashboard?checkout=success&order_id=${encodeURIComponent(order.id)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/marketplace?checkout=cancelled`,
      });
      if (!session.url) throw new Error('Stripe did not return a Checkout URL.');
      return res.status(201).json({ orderId: order.id, checkoutUrl: session.url, status: 'pending' });
    } catch (stripeError) {
      await prisma.order.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      throw stripeError;
    }
  } catch (error) {
    console.error('Stripe Checkout session creation failed', error);
    return res.status(502).json({ error: 'Unable to start secure checkout. No payment was confirmed.' });
  }
});

// Stripe alone can confirm payment. Browser redirects never mark an order as paid.
app.post('/webhooks/stripe', async (req, res) => {
  const stripe = stripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers['stripe-signature'];
  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;

  if (!stripe || !webhookSecret) {
    return res.status(503).json({ error: 'Stripe webhook is not configured.' });
  }
  if (typeof signature !== 'string' || !rawBody) {
    return res.status(400).json({ error: 'Missing Stripe signature or raw request body.' });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.warn('Stripe webhook signature verification failed', error);
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  try {
    const session = event.data.object as Stripe.Checkout.Session;
    if ([
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'checkout.session.expired',
    ].includes(event.type)) {
      const orderId = session.metadata?.orderId;
      if (!orderId) return res.status(400).json({ error: 'Checkout session is missing its order reference.' });

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) return res.status(404).json({ error: 'Order not found.' });

      if (session.mode !== 'payment' || session.client_reference_id !== orderId) {
        return res.status(400).json({ error: 'Stripe session does not match the order reference.' });
      }

      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        if (session.payment_status !== 'paid') return res.status(200).json({ received: true, pendingPayment: true });
        const paidAmountMatches = session.amount_total === order.totalCents;
        const currencyMatches = session.currency?.toLowerCase() === order.currency.toLowerCase();
        const buyerMatches = session.metadata?.buyerId === order.buyerId;
        const datasetMatches = session.metadata?.datasetId === order.datasetId;
        if (!paidAmountMatches || !currencyMatches || !buyerMatches || !datasetMatches) {
          console.error('Stripe session does not match stored order', { orderId, eventId: event.id });
          return res.status(400).json({ error: 'Stripe payment does not match the stored order.' });
        }
        await prisma.order.updateMany({
          where: { id: orderId, status: 'PENDING' },
          data: { status: 'PAID' },
        });
      } else {
        await prisma.order.updateMany({
          where: { id: orderId, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
      }
    }
    return res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing failed', error);
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
});

// A buyer can check the server-side order state after Stripe redirects back.
// This endpoint never marks an order paid; only the signed webhook can do that.
app.get('/orders/checkout-session/:sessionId', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  const sessionId = String(req.params.sessionId || '');
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid Checkout session reference.' });
  }
  const stripe = stripeClient();
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured on the server.' });
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const orderId = session.metadata?.orderId;
    if (session.mode !== 'payment' || session.metadata?.buyerId !== user.id || !orderId) {
      return res.status(404).json({ error: 'Checkout session not found for this account.' });
    }
    const order = await prisma.order.findFirst({
      where: { id: orderId, buyerId: user.id },
      select: { id: true, status: true, totalCents: true, currency: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    return res.json({
      orderId: order.id,
      status: order.status.toLowerCase(),
      paymentStatus: session.payment_status,
      totalCents: order.totalCents,
      currency: order.currency,
    });
  } catch (error) {
    console.error('Stripe Checkout session lookup failed', error);
    return res.status(502).json({ error: 'Unable to verify Checkout status right now.' });
  }
});

// Dataset delivery is generated from the original saved public USAspending records.
// Access is restricted to the authenticated buyer on an order confirmed PAID by webhook.
app.get('/orders/:id/download', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const order = await prisma.order.findFirst({
      where: { id: String(req.params.id), buyerId: user.id, status: 'PAID' },
      include: { dataset: true },
    });
    if (!order) return res.status(404).json({ error: 'A paid order for this account was not found.' });
    if (!order.dataset.tags.includes('factory:v1') || order.dataset.licenseType === 'RESTRICTED') {
      return res.status(409).json({ error: 'This purchased listing is not approved for automated file delivery.' });
    }
    const recordIds = order.dataset.tags
      .filter((tag) => tag.startsWith('source-record-id:'))
      .map((tag) => tag.slice('source-record-id:'.length));
    if (recordIds.length === 0 || new Set(recordIds).size !== recordIds.length) {
      return res.status(409).json({ error: 'The purchased listing has no valid attached source records.' });
    }

    const records = await prisma.supplierResearchRecord.findMany({
      where: { id: { in: recordIds }, source: 'usaspending.gov' },
      orderBy: [{ retrievedAt: 'desc' }, { supplierName: 'asc' }],
    });
    if (records.length !== recordIds.length) {
      return res.status(409).json({ error: 'The complete source record set is not available for delivery. Contact the seller for assistance.' });
    }

    const csvCell = (value: unknown) => {
      let text = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
      if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const headers = ['supplierName', 'awardAmount', 'awardId', 'awardingAgency', 'description', 'startDate', 'endDate', 'performanceState', 'naics', 'supplierUei', 'source', 'sourceRecordId', 'sourceUrl', 'retrievedAt'];
    const rows = records.map((record) => {
      const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
        ? record.payload as Record<string, unknown>
        : {};
      const values = [
        record.supplierName,
        record.awardAmount?.toString() ?? payload.awardAmount,
        record.sourceRecordId,
        payload.awardingAgency,
        payload.description,
        payload.startDate,
        payload.endDate,
        payload.performanceState,
        payload.naics,
        payload.supplierUei,
        record.source,
        record.sourceRecordId,
        record.sourceUrl,
        record.retrievedAt.toISOString(),
      ];
      return values.map(csvCell).join(',');
    });
    const csv = [headers.map(csvCell).join(','), ...rows].join('\r\n');
    const safeName = order.dataset.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'dataset';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${order.id}.csv"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send('\uFEFF' + csv);
  } catch (error) {
    console.error('Paid dataset download failed', error);
    return res.status(500).json({ error: 'Unable to prepare the purchased dataset download.' });
  }
});

// Public marketplace figures come from persisted database records only.
app.get('/marketplace/overview', async (_req, res) => {
  try {
    const [
      paidOrderValue,
      paidOrders,
      publishedDatasets,
      totalDatasets,
      supplierResearchRecords,
      latestSupplierRecord,
    ] = await Promise.all([
      prisma.order.aggregate({
        _sum: { totalCents: true },
        where: { AND: [{ status: 'PAID' }, nonDemoPaidOrderFilter] },
      }),
      prisma.order.count({ where: { AND: [{ status: 'PAID' }, nonDemoPaidOrderFilter] } }),
      prisma.dataset.count({ where: { AND: [{ status: 'PUBLISHED' }, nonDemoDatasetFilter] } }),
      prisma.dataset.count({ where: nonDemoDatasetFilter }),
      prisma.supplierResearchRecord.count(),
      prisma.supplierResearchRecord.findFirst({
        orderBy: { retrievedAt: 'desc' },
        select: { retrievedAt: true },
      }),
    ]);

    return res.json({
      source: 'database',
      updatedAt: new Date().toISOString(),
      // These are database records, not confirmation of a processed payment.
      paymentProcessingEnabled: false,
      snapshot: {
        recordedPaidOrderValueCents: Number(paidOrderValue._sum.totalCents ?? 0),
        paidOrders,
        publishedDatasets,
        totalDatasets,
        supplierResearchRecords,
        latestSupplierRetrievedAt: latestSupplierRecord?.retrievedAt.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('Marketplace overview failed', error);
    return res.status(500).json({ error: 'Unable to load marketplace figures from the database.' });
  }
});

// Authenticated dashboard figures are scoped to the signed-in account, except for admins.
// Buyers can only inspect their own order and its server-confirmed payment status.
app.get('/orders/:id', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const order = await prisma.order.findFirst({
      where: { id: String(req.params.id), buyerId: user.id },
      include: { dataset: { select: { title: true, category: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    return res.json({
      order: {
        id: order.id,
        status: order.status.toLowerCase(),
        totalCents: order.totalCents,
        currency: order.currency,
        datasetTitle: order.dataset.title,
        category: order.dataset.category,
        createdAt: order.createdAt,
      },
      downloadable: order.status === 'PAID',
    });
  } catch (error) {
    console.error('Order status lookup failed', error);
    return res.status(500).json({ error: 'Unable to retrieve order status.' });
  }
});

// Return the exact source records attached to the purchased product only after payment.
app.get('/orders/:id/download', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const order = await prisma.order.findFirst({
      where: { id: String(req.params.id), buyerId: user.id, status: 'PAID' },
      include: { dataset: true },
    });
    if (!order) return res.status(404).json({ error: 'A paid order for this account was not found.' });

    const dataset = order.dataset;
    if (!dataset.tags.includes('factory:v1')) {
      return res.status(409).json({ error: 'This product does not have a Data Bank delivery package.' });
    }
    const recordIds = dataset.tags
      .filter((tag) => tag.startsWith('source-record-id:'))
      .map((tag) => tag.slice('source-record-id:'.length));
    if (recordIds.length === 0) {
      return res.status(409).json({ error: 'No source records are attached to this dataset.' });
    }

    const records = await prisma.supplierResearchRecord.findMany({
      where: { id: { in: recordIds } },
      orderBy: [{ retrievedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        source: true,
        sourceRecordId: true,
        supplierName: true,
        awardAmount: true,
        sourceUrl: true,
        payload: true,
        retrievedAt: true,
      },
    });
    if (records.length !== recordIds.length) {
      return res.status(409).json({ error: 'The delivery package is incomplete. Please contact the marketplace.' });
    }

    const packageData = {
      format: 'ai-data-marketplace.dataset.v1',
      orderId: order.id,
      purchasedAt: order.createdAt.toISOString(),
      dataset: {
        id: dataset.id,
        title: dataset.title,
        category: dataset.category,
        description: dataset.description,
        qualityScore: dataset.qualityScore,
        recordCount: records.length,
        sourceCount: dataset.sourceCount,
        sources: dataset.tags.filter((tag) => tag.startsWith('source:')),
      },
      records: records.map((record) => ({
        source: record.source,
        sourceRecordId: record.sourceRecordId,
        supplierName: record.supplierName,
        awardAmount: record.awardAmount?.toString() ?? null,
        sourceUrl: record.sourceUrl,
        retrievedAt: record.retrievedAt.toISOString(),
        data: record.payload,
      })),
      notice: 'Source links and retrieval timestamps are included for provenance. Buyers are responsible for complying with applicable source terms and the license stated on the listing.',
    };
    const safeName = dataset.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'dataset';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.json"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(JSON.stringify(packageData, null, 2));
  } catch (error) {
    console.error('Paid dataset download failed', error);
    return res.status(500).json({ error: 'Unable to prepare the dataset download.' });
  }
});

app.get('/dashboard/overview', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  const isAdmin = user.role === 'admin';
  const isTestAccount = user.email.toLowerCase().endsWith('@local.test');
  const orderScope: any = isAdmin
    ? {}
    : user.role === 'seller'
      ? { dataset: { sellerId: user.id } }
      : { buyerId: user.id };
  const paidOrderWhere: any = {
    AND: [{ status: 'PAID' }, orderScope, nonDemoPaidOrderFilter],
  };

  const datasetScope: any = isAdmin
    ? {}
    : user.role === 'seller'
      ? { sellerId: user.id }
      : { status: 'PUBLISHED' };
  const datasetWhere: any = { AND: [datasetScope, nonDemoDatasetFilter] };

  const publishedDatasetScope: any = user.role === 'seller'
    ? { sellerId: user.id, status: 'PUBLISHED' }
    : { status: 'PUBLISHED' };
  const publishedDatasetWhere: any = {
    AND: [publishedDatasetScope, nonDemoDatasetFilter],
  };

  const payoutScope: any = isAdmin ? {} : { userId: user.id };
  const payoutWhere: any = {
    AND: [
      payoutScope,
      nonDemoPayoutFilter,
      { status: { in: ['REQUESTED', 'PROCESSING', 'APPROVED'] } },
    ],
  };

  try {
    const [
      wallet,
      totalDatasets,
      publishedDatasets,
      paidOrderValue,
      paidOrders,
      pendingPayouts,
      supplierResearchRecords,
      latestSupplierRecord,
      recentOrders,
      recentSupplierRecords,
      userCount,
    ] = await Promise.all([
      prisma.walletAccount.findUnique({ where: { userId: user.id } }),
      prisma.dataset.count({ where: datasetWhere }),
      prisma.dataset.count({ where: publishedDatasetWhere }),
      prisma.order.aggregate({ _sum: { totalCents: true }, where: paidOrderWhere }),
      prisma.order.count({ where: paidOrderWhere }),
      prisma.payout.count({ where: payoutWhere }),
      prisma.supplierResearchRecord.count(),
      prisma.supplierResearchRecord.findFirst({
        orderBy: { retrievedAt: 'desc' },
        select: { retrievedAt: true },
      }),
      prisma.order.findMany({
        where: paidOrderWhere,
        include: { dataset: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.supplierResearchRecord.findMany({
        orderBy: { retrievedAt: 'desc' },
        select: {
          id: true,
          source: true,
          supplierName: true,
          awardAmount: true,
          sourceUrl: true,
          retrievedAt: true,
        },
        take: 5,
      }),
      isAdmin ? prisma.user.count({ where: nonDemoUserFilter }) : Promise.resolve(null),
    ]);

    return res.json({
      source: 'database',
      updatedAt: new Date().toISOString(),
      role: user.role,
      testAccount: isTestAccount,
      paymentProcessingEnabled: false,
      snapshot: {
        walletBalanceCents: isTestAccount ? 0 : (wallet?.balanceCents ?? 0),
        totalDatasets,
        publishedDatasets,
        recordedPaidOrderValueCents: Number(paidOrderValue._sum.totalCents ?? 0),
        paidOrders,
        pendingPayouts,
        supplierResearchRecords,
        latestSupplierRetrievedAt: latestSupplierRecord?.retrievedAt.toISOString() ?? null,
        userCount,
      },
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        datasetTitle: order.dataset.title,
        totalCents: order.totalCents,
        currency: order.currency,
        status: order.status.toLowerCase(),
        createdAt: order.createdAt.toISOString(),
      })),
      recentSupplierRecords: recentSupplierRecords.map((record) => ({
        id: record.id,
        source: record.source,
        supplierName: record.supplierName,
        awardAmount: record.awardAmount?.toString() ?? null,
        sourceUrl: record.sourceUrl,
        retrievedAt: record.retrievedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Dashboard overview failed', error);
    return res.status(500).json({ error: 'Unable to load live dashboard figures from the database.' });
  }
});

// Role-scoped dashboard detail endpoints use stored records; no local demo data is returned.
app.get('/dashboard/datasets', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  const scope: any = user.role === 'admin'
    ? {}
    : user.role === 'seller'
      ? { sellerId: user.id }
      : { status: 'PUBLISHED' };
  try {
    const datasets = await prisma.dataset.findMany({
      where: { AND: [scope, nonDemoDatasetFilter] },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ datasets: datasets.map(serializeDataset) });
  } catch (error) {
    console.error('Dashboard datasets failed', error);
    return res.status(500).json({ error: 'Unable to load datasets from the database.' });
  }
});

app.get('/dashboard/orders', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  const scope: any = user.role === 'admin'
    ? {}
    : user.role === 'seller'
      ? { dataset: { sellerId: user.id } }
      : { buyerId: user.id };
  try {
    const orders = await prisma.order.findMany({
      where: { AND: [scope, nonDemoOrderFilter] },
      include: { dataset: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json({
      orders: orders.map((order) => ({
        id: order.id,
        datasetTitle: order.dataset.title,
        totalCents: order.totalCents,
        currency: order.currency,
        status: order.status.toLowerCase(),
        createdAt: order.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Dashboard orders failed', error);
    return res.status(500).json({ error: 'Unable to load orders from the database.' });
  }
});

app.get('/dashboard/payouts', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  const scope: any = user.role === 'admin' ? {} : { userId: user.id };
  try {
    const payouts = await prisma.payout.findMany({
      where: { AND: [scope, nonDemoPayoutFilter] },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
    return res.json({ payouts: payouts.map(serializePayout) });
  } catch (error) {
    console.error('Dashboard payouts failed', error);
    return res.status(500).json({ error: 'Unable to load payout requests from the database.' });
  }
});

// Admin-only diagnostic: inspect the exact PostgreSQL role used by this API connection.
 // Never returns connection strings, credentials, or role names.
app.get('/admin/database-security-check', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    const rows = await prisma.$queryRaw<Array<{
      isSuperuser: boolean;
      bypassRls: boolean;
      tableName: string;
      tableExists: boolean;
      rlsEnabled: boolean;
      forceRls: boolean;
      isTableOwner: boolean;
      canSelect: boolean;
      canInsert: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    }>>`
      SELECT
        role.rolsuper AS "isSuperuser",
        role.rolbypassrls AS "bypassRls",
        requested.table_name AS "tableName",
        (table_info.oid IS NOT NULL) AS "tableExists",
        COALESCE(table_info.relrowsecurity, false) AS "rlsEnabled",
        COALESCE(table_info.relforcerowsecurity, false) AS "forceRls",
        COALESCE(table_info.relowner = role.oid, false) AS "isTableOwner",
        COALESCE(has_table_privilege(current_user, table_info.oid, 'SELECT'), false) AS "canSelect",
        COALESCE(has_table_privilege(current_user, table_info.oid, 'INSERT'), false) AS "canInsert",
        COALESCE(has_table_privilege(current_user, table_info.oid, 'UPDATE'), false) AS "canUpdate",
        COALESCE(has_table_privilege(current_user, table_info.oid, 'DELETE'), false) AS "canDelete"
      FROM pg_roles AS role
      CROSS JOIN (VALUES
        ('User'),
        ('WalletAccount'),
        ('Dataset'),
        ('Listing'),
        ('Order'),
        ('WalletTransaction'),
        ('SupplierResearchRecord'),
        ('Payout'),
        ('Lead'),
        ('LeadActivity')
      ) AS requested(table_name)
      LEFT JOIN pg_class AS table_info
        ON table_info.relname = requested.table_name
       AND table_info.relnamespace = 'public'::regnamespace
       AND table_info.relkind IN ('r', 'p')
      WHERE role.rolname = current_user
      ORDER BY requested.table_name
    `;

    const role = rows[0];
    const tableChecks = rows.map((table) => ({
      table: table.tableName,
      exists: table.tableExists,
      rlsEnabled: table.rlsEnabled,
      forceRls: table.forceRls,
      isTableOwner: table.isTableOwner,
      canSelect: table.canSelect,
      canInsert: table.canInsert,
      canUpdate: table.canUpdate,
      canDelete: table.canDelete,
      canOperateWithRls: table.tableExists && (
        role.isSuperuser ||
        role.bypassRls ||
        (table.isTableOwner && !table.forceRls)
      ),
    }));

    return res.json({
      source: 'current_api_database_connection',
      roleCanBypassRls: Boolean(role?.isSuperuser || role?.bypassRls),
      tables: tableChecks,
      note: 'Run this diagnostic using an administrator account. It does not reveal credentials or modify database state.',
    });
  } catch (error) {
    console.error('Database security diagnostic failed', error);
    return res.status(500).json({ error: 'Unable to inspect the API database connection permissions.' });
  }
});

app.get('/admin/overview', requireAuth, requireRole(['admin']), async (_req, res) => {
  const [
    datasets,
    orders,
    payouts,
    users,
    totalRevenue,
    activeOrders,
    pendingPayouts,
    platformLiquidity,
  ] = await Promise.all([
    prisma.dataset.findMany({ where: nonDemoDatasetFilter, orderBy: { createdAt: 'desc' } }),
    prisma.order.findMany({ where: nonDemoPaidOrderFilter, orderBy: { createdAt: 'desc' } }),
    prisma.payout.findMany({ where: nonDemoPayoutFilter, orderBy: { requestedAt: 'desc' } }),
    prisma.user.findMany({ where: nonDemoUserFilter, orderBy: { createdAt: 'desc' } }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { AND: [{ status: 'PAID' }, nonDemoPaidOrderFilter] },
    }),
    prisma.order.count({ where: { AND: [{ status: 'PAID' }, nonDemoPaidOrderFilter] } }),
    prisma.payout.count({ where: { AND: [{ status: { in: ['REQUESTED', 'PROCESSING', 'APPROVED'] } }, nonDemoPayoutFilter] } }),
    prisma.walletAccount.aggregate({
      _sum: { balanceCents: true },
      where: { user: { isNot: { email: { endsWith: '@local.test' } } } },
    }),
  ]);

  return res.json({
    snapshot: {
      totalRevenueCents: Number(totalRevenue._sum.totalCents ?? 0),
      totalDatasets: datasets.length,
      activeOrders,
      pendingPayouts,
      platformLiquidityCents: Number(platformLiquidity._sum.balanceCents ?? 0),
      updatedAt: new Date().toISOString(),
    },
    datasets: datasets.map(serializeDataset),
    orders: orders.map((order) => ({
      id: order.id,
      buyerId: order.buyerId,
      datasetId: order.datasetId,
      totalCents: order.totalCents,
      currency: order.currency,
      status: order.status.toLowerCase(),
      createdAt: order.createdAt.toISOString(),
    })),
    payouts: payouts.map(serializePayout),
    users: users.map(({ passwordHash: _passwordHash, ...user }) => serializeUser(user as any)),
  });
});

Sentry.setupExpressErrorHandler(app);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled API error', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error.' });
});

export default app;

if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`AI Data Marketplace API listening on http://localhost:${port}`);
  });
}
