import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const demoPasswordHash = await bcrypt.hash('demo123', 12);
  const platformPasswordHash = await bcrypt.hash('platform-secret', 12);
  const platform = await prisma.user.upsert({
    where: { email: 'platform@aidata.com' },
    update: {},
    create: {
      name: 'Platform Treasury',
      email: 'platform@aidata.com',
      passwordHash: platformPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  const seller = await prisma.user.upsert({
    where: { email: 'seller@aidata.com' },
    update: {},
    create: {
      name: 'Ava Seller',
      email: 'seller@aidata.com',
      passwordHash: demoPasswordHash,
      role: 'SELLER',
      status: 'ACTIVE',
    },
  });

  const buyer = await prisma.user.upsert({
    where: { email: 'buyer@aidata.com' },
    update: {},
    create: {
      name: 'Morgan Buyer',
      email: 'buyer@aidata.com',
      passwordHash: demoPasswordHash,
      role: 'BUYER',
      status: 'ACTIVE',
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@aidata.com' },
    update: {},
    create: {
      name: 'Ops Admin',
      email: 'admin@aidata.com',
      passwordHash: demoPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.walletAccount.upsert({
    where: { userId: platform.id },
    update: { balanceCents: 1250000 },
    create: {
      userId: platform.id,
      balanceCents: 1250000,
      currency: 'USD',
      status: 'ACTIVE',
    },
  });

  await prisma.walletAccount.upsert({
    where: { userId: seller.id },
    update: { balanceCents: 450000 },
    create: {
      userId: seller.id,
      balanceCents: 450000,
      currency: 'USD',
      status: 'ACTIVE',
    },
  });

  await prisma.walletAccount.upsert({
    where: { userId: buyer.id },
    update: { balanceCents: 240000 },
    create: {
      userId: buyer.id,
      balanceCents: 240000,
      currency: 'USD',
      status: 'ACTIVE',
    },
  });

  await prisma.walletAccount.upsert({
    where: { userId: admin.id },
    update: { balanceCents: 780000 },
    create: {
      userId: admin.id,
      balanceCents: 780000,
      currency: 'USD',
      status: 'ACTIVE',
    },
  });

  const datasetOne = await prisma.dataset.upsert({
    where: { id: 'dataset-1' },
    update: {},
    create: {
      id: 'dataset-1',
      sellerId: seller.id,
      title: 'Global AI Hiring Signal Index',
      category: 'talent-intelligence',
      description: 'Normalized hiring trends across major markets and roles, updated weekly.',
      priceCents: 29900,
      qualityScore: 97,
      licenseType: 'COMMERCIAL',
      sourceCount: 18,
      status: 'PUBLISHED',
      tags: ['hiring', 'ai', 'talent'],
    },
  });

  await prisma.dataset.upsert({
    where: { id: 'dataset-2' },
    update: {},
    create: {
      id: 'dataset-2',
      sellerId: seller.id,
      title: 'SaaS Pricing Benchmark Dataset',
      category: 'market-research',
      description: 'Structured pricing tables and positioning signals for software categories.',
      priceCents: 39900,
      qualityScore: 94,
      licenseType: 'ENTERPRISE',
      sourceCount: 26,
      status: 'PUBLISHED',
      tags: ['pricing', 'saas', 'benchmark'],
    },
  });

  await prisma.order.upsert({
    where: { id: 'order-1' },
    update: {},
    create: {
      id: 'order-1',
      buyerId: buyer.id,
      datasetId: datasetOne.id,
      totalCents: 29900,
      currency: 'USD',
      status: 'PAID',
    },
  });

  await prisma.payout.upsert({
    where: { id: 'payout-1' },
    update: {},
    create: {
      id: 'payout-1',
      userId: seller.id,
      walletAccountId: (await prisma.walletAccount.findUniqueOrThrow({ where: { userId: seller.id } })).id,
      amountCents: 125000,
      method: 'BANK_TRANSFER',
      destinationAccount: '**** 2847',
      status: 'PROCESSING',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
