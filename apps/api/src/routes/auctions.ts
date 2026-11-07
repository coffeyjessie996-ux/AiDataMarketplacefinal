import express from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';

type AuthReq = express.Request & { user?: User };

const createSchema = z.object({
  datasetId: z.string().min(1),
  startingBidCents: z.number().int().positive().max(100_000_000),
  minimumIncrementCents: z.number().int().positive().max(10_000_000).default(100),
  closesAt: z.string().datetime(),
  rightsConfirmed: z.literal(true),
});

const bidSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_000),
});

export function createAuctionsRouter(prisma: PrismaClient, auth: express.RequestHandler) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const limitValue = Number(req.query.limit ?? 30);
    const limit = Number.isInteger(limitValue) ? Math.max(1, Math.min(50, limitValue)) : 30;
    try {
      const auctions = await prisma.auction.findMany({
        where: { status: 'OPEN', closesAt: { gt: new Date() }, dataset: { status: 'PUBLISHED', licenseType: { not: 'RESTRICTED' } } },
        include: {
          dataset: { select: { id: true, title: true, category: true, description: true, qualityScore: true, licenseType: true } },
          bids: { where: { status: 'ACTIVE' }, orderBy: [{ amountCents: 'desc' }, { createdAt: 'asc' }], take: 1, select: { amountCents: true } },
          _count: { select: { bids: true } },
        },
        orderBy: { closesAt: 'asc' },
        take: limit,
      });
      return res.json({
        auctions: auctions.map((auction) => ({
          id: auction.id,
          dataset: auction.dataset,
          startingBidCents: auction.startingBidCents,
          currentBidCents: auction.bids[0]?.amountCents ?? null,
          minimumIncrementCents: auction.minimumIncrementCents,
          currency: auction.currency,
          bidCount: auction._count.bids,
          closesAt: auction.closesAt.toISOString(),
          createdAt: auction.createdAt.toISOString(),
        })),
        note: 'Bids are offers only. No order, payment, or sale is created by bidding.',
      });
    } catch (error) {
      console.error('Auction listing failed', error);
      return res.status(500).json({ error: 'Unable to load active auctions.' });
    }
  });

  router.post('/', auth, async (req: AuthReq, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (!['SELLER', 'ADMIN'].includes(user.role)) return res.status(403).json({ error: 'A seller account is required to create an auction.' });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const closesAt = new Date(parsed.data.closesAt);
    if (closesAt <= new Date() || closesAt.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Auction closing time must be within the next 30 days.' });
    }

    try {
      const dataset = await prisma.dataset.findUnique({ where: { id: parsed.data.datasetId } });
      if (!dataset || dataset.status !== 'PUBLISHED') return res.status(404).json({ error: 'Only an existing published dataset can be auctioned.' });
      if (dataset.licenseType === 'RESTRICTED') return res.status(400).json({ error: 'Restricted datasets cannot be auctioned.' });
      if (user.role !== 'ADMIN' && dataset.sellerId !== user.id) return res.status(403).json({ error: 'You can only auction your own dataset.' });

      const auction = await prisma.auction.create({
        data: {
          datasetId: dataset.id,
          startingBidCents: parsed.data.startingBidCents,
          minimumIncrementCents: parsed.data.minimumIncrementCents,
          closesAt,
          rightsConfirmedAt: new Date(),
          status: 'OPEN',
        },
      });
      return res.status(201).json({ auction, note: 'Auction created. Bids are non-binding offers until separately reviewed and accepted; no payment has been taken.' });
    } catch (error) {
      console.error('Auction creation failed', error);
      return res.status(500).json({ error: 'Unable to create auction.' });
    }
  });

  router.get('/:auctionId/bids', auth, async (req: AuthReq, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const auctionIdParam = req.params.auctionId;
    const auctionId = Array.isArray(auctionIdParam) ? auctionIdParam[0] : auctionIdParam;
    if (!auctionId) return res.status(400).json({ error: 'Auction ID is required.' });
    try {
      const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
      if (!auction) return res.status(404).json({ error: 'Auction not found.' });
      const dataset = await prisma.dataset.findUnique({
        where: { id: auction.datasetId },
        select: { sellerId: true },
      });
      if (!dataset) return res.status(404).json({ error: 'Auction dataset not found.' });
      if (user.role !== 'ADMIN' && dataset.sellerId !== user.id) {
        return res.status(403).json({ error: 'Only the dataset owner can review offers.' });
      }
      const bids = await prisma.auctionBid.findMany({
        where: { auctionId: auction.id, status: 'ACTIVE' },
        include: { bidder: { select: { name: true } } },
        orderBy: [{ amountCents: 'desc' }, { createdAt: 'asc' }],
      });
      return res.json({ bids: bids.map((bid) => ({
        id: bid.id,
        bidderName: bid.bidder.name,
        amountCents: bid.amountCents,
        createdAt: bid.createdAt.toISOString(),
      })) });
    } catch (error) {
      console.error('Auction offers lookup failed', error);
      return res.status(500).json({ error: 'Unable to load auction offers.' });
    }
  });

  router.post('/:auctionId/bids', auth, async (req: AuthReq, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const parsed = bidSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const auctionIdParam = req.params.auctionId;
      const auctionId = Array.isArray(auctionIdParam) ? auctionIdParam[0] : auctionIdParam;
      if (!auctionId) return res.status(400).json({ error: 'Auction ID is required.' });
      const result = await prisma.$transaction(async (tx) => {
        const auction = await tx.auction.findUnique({ where: { id: auctionId } });
        if (!auction || auction.status !== 'OPEN' || auction.closesAt <= new Date()) {
          return { error: 'This auction is not open for bidding.', status: 404 as const };
        }
        const dataset = await tx.dataset.findUnique({
          where: { id: auction.datasetId },
          select: { sellerId: true, status: true, licenseType: true },
        });
        if (!dataset || dataset.status !== 'PUBLISHED' || dataset.licenseType === 'RESTRICTED') {
          return { error: 'This auction is not open for bidding.', status: 404 as const };
        }
        if (dataset.sellerId === user.id) return { error: 'You cannot bid on your own dataset.', status: 403 as const };
        const highest = await tx.auctionBid.findFirst({
          where: { auctionId: auction.id, status: 'ACTIVE' },
          orderBy: [{ amountCents: 'desc' }, { createdAt: 'asc' }],
        });
        const minimum = highest
          ? highest.amountCents + auction.minimumIncrementCents
          : auction.startingBidCents;
        if (parsed.data.amountCents < minimum) {
          return { error: `Your bid must be at least $${(minimum / 100).toFixed(2)}.`, status: 400 as const };
        }
        const bid = await tx.auctionBid.create({
          data: { auctionId: auction.id, bidderId: user.id, amountCents: parsed.data.amountCents },
          select: { id: true, amountCents: true, createdAt: true },
        });
        return { bid };
      }, { isolationLevel: 'Serializable' });

      if ('error' in result) return res.status(result.status ?? 400).json({ error: result.error });
      return res.status(201).json({ bid: result.bid, note: 'Offer recorded only. This is not a purchase and no payment has been taken.' });
    } catch (error) {
      console.error('Auction bid failed', error);
      return res.status(409).json({ error: 'The auction changed while your bid was being placed. Refresh and try again.' });
    }
  });

  return router;
}
