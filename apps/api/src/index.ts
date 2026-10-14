import './instrument';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { scrapeSources } from './services/scraper';
import { prisma } from './lib/prisma';
import { User } from './types';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// The web app calls `/api/*` (rewritten to this service), while routes are defined without the prefix.
app.use((req, _res, next) => {
  if (req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?')) {
    req.url = req.url.slice(4) || '/';
  }
  next();
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

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['buyer', 'seller', 'admin']).default('buyer'),
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

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ai-data-marketplace-api', timestamp: new Date().toISOString() });
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
      role: (user.role as string).toLowerCase(),
      status: (user.status as string).toLowerCase(),
    },
    wallet: wallet ? serializeWallet(wallet) : null,
  });
});

app.get('/users', requireAuth, requireRole(['admin']), async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  return res.json({ users: users.map((user) => serializeUser(user)) });
});

app.get('/datasets', async (_req, res) => {
  const datasets = await prisma.dataset.findMany({ orderBy: { createdAt: 'desc' } });
  return res.json({ datasets: datasets.map(serializeDataset) });
});

app.get('/datasets/:id', async (req, res) => {
  const dataset = await prisma.dataset.findUnique({ where: { id: req.params.id } });
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

// Scraper endpoint - accepts array of URLs and returns scraped snippets
app.post('/scrapers/start', requireAuth, async (req, res) => {
  try {
    const urls = Array.isArray(req.body?.urls)
      ? req.body.urls.filter((url: unknown): url is string => typeof url === 'string')
      : [];

    if (urls.length === 0) {
      return res.status(400).json({
        error: 'Provide at least one URL to scrape.',
      });
    }

    const results = await scrapeSources(urls);

    return res.status(200).json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Scraper failed', error);
    return res.status(500).json({
      error: 'Scraper failed.',
    });
  }
});

app.get('/wallet', requireAuth, async (req, res) => {
  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const wallet = await prisma.walletAccount.findUnique({ where: { userId: user.id } });
  return res.json({ wallet: wallet ? serializeWallet(wallet) : null });
});

app.post('/wallet/payout', requireAuth, async (req, res) => {
  const parsed = payoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const wallet = await prisma.walletAccount.findUnique({ where: { userId: user.id } });
  if (!wallet) return res.status(404).json({ error: 'Wallet not found.' });
  if (wallet.balanceCents < parsed.data.amountCents) {
    return res.status(400).json({ error: 'Insufficient wallet balance.' });
  }

  const updatedWallet = await prisma.walletAccount.update({
    where: { id: wallet.id },
    data: { balanceCents: wallet.balanceCents - parsed.data.amountCents },
  });

  const payout = await prisma.payout.create({
    data: {
      userId: user.id,
      walletAccountId: wallet.id,
      amountCents: parsed.data.amountCents,
      method: parsed.data.method.toUpperCase() as any,
      destinationAccount: parsed.data.destinationAccount,
      status: 'REQUESTED',
    },
  });

  return res.status(201).json({
    payout: serializePayout(payout),
    wallet: serializeWallet(updatedWallet),
  });
});

app.post('/orders', requireAuth, async (req, res) => {
  const schema = z.object({ datasetId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const user = (req as express.Request & { user?: User }).user;
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const dataset = await prisma.dataset.findUnique({ where: { id: parsed.data.datasetId } });
  if (!dataset) return res.status(404).json({ error: 'Dataset not found.' });
  if (dataset.sellerId === user.id) {
    return res.status(400).json({ error: 'Sellers cannot buy their own dataset.' });
  }

  const buyerWallet = await prisma.walletAccount.findUnique({ where: { userId: user.id } });
  if (!buyerWallet || buyerWallet.balanceCents < dataset.priceCents) {
    return res.status(400).json({ error: 'Buyer wallet balance is insufficient.' });
  }

  const sellerWallet = await prisma.walletAccount.findUnique({ where: { userId: dataset.sellerId } });
  const platformWallet = await prisma.walletAccount.findFirst({ where: { userId: 'platform' } });

  const sellerShare = Math.round(dataset.priceCents * 0.85);
  const platformShare = dataset.priceCents - sellerShare;

  const updatedBuyerWallet = await prisma.walletAccount.update({
    where: { id: buyerWallet.id },
    data: { balanceCents: buyerWallet.balanceCents - dataset.priceCents },
  });

  if (sellerWallet) {
    await prisma.walletAccount.update({
      where: { id: sellerWallet.id },
      data: { balanceCents: sellerWallet.balanceCents + sellerShare },
    });
  }

  if (platformWallet) {
    await prisma.walletAccount.update({
      where: { id: platformWallet.id },
      data: { balanceCents: platformWallet.balanceCents + platformShare },
    });
  }

  const order = await prisma.order.create({
    data: {
      buyerId: user.id,
      datasetId: dataset.id,
      totalCents: dataset.priceCents,
      currency: 'USD',
      status: 'PAID',
    },
  });

  return res.status(201).json({
    order: {
      id: order.id,
      buyerId: order.buyerId,
      datasetId: order.datasetId,
      totalCents: order.totalCents,
      currency: order.currency,
      status: order.status.toLowerCase(),
      createdAt: order.createdAt.toISOString(),
    },
    buyerWallet: serializeWallet(updatedBuyerWallet),
    sellerWallet: sellerWallet ? serializeWallet(sellerWallet) : null,
    platformWallet: platformWallet ? serializeWallet(platformWallet) : null,
  });
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
    prisma.dataset.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.order.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.payout.findMany({ orderBy: { requestedAt: 'desc' } }),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { status: 'PAID' },
    }),
    prisma.order.count({ where: { status: 'PAID' } }),
    prisma.payout.count({ where: { status: { not: 'COMPLETED' } } }),
    prisma.walletAccount.aggregate({
      _sum: { balanceCents: true },
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
