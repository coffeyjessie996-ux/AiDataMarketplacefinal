import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Running seed script...');

  // Platform user (fixed id 'platform' so platform wallet can reference it)
  const platformPassword = await bcrypt.hash('platform', 12);
  const platform = await prisma.user.upsert({
    where: { id: 'platform' },
    update: {},
    create: {
      id: 'platform',
      name: 'Platform',
      email: 'platform@local.test',
      passwordHash: platformPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.walletAccount.upsert({
    where: { userId: platform.id },
    update: {},
    create: {
      userId: platform.id,
      balanceCents: 1000000,
      currency: 'USD',
      status: 'ACTIVE',
    },
  });

  // Admin user
  const adminPasswordPlain = 'adminpass';
  const adminPassword = await bcrypt.hash(adminPasswordPlain, 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@local.test' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@local.test',
      passwordHash: adminPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  await prisma.walletAccount.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      balanceCents: 50000,
      currency: 'USD',
      status: 'ACTIVE',
    },
  });

  // Seller user
  const sellerPasswordPlain = 'sellerpass';
  const sellerPassword = await bcrypt.hash(sellerPasswordPlain, 12);
  const seller = await prisma.user.upsert({
    where: { email: 'seller@local.test' },
    update: {},
    create: {
      name: 'Sample Seller',
      email: 'seller@local.test',
      passwordHash: sellerPassword,
      role: 'SELLER',
      status: 'ACTIVE',
    },
  });

  await prisma.walletAccount.upsert({
    where: { userId: seller.id },
    update: {},
    create: {
      userId: seller.id,
      balanceCents: 20000,
      currency: 'USD',
      status: 'ACTIVE',
    },
  });

  // Buyer user
  const buyerPasswordPlain = 'buyerpass';
  const buyerPassword = await bcrypt.hash(buyerPasswordPlain, 12);
  const buyer = await prisma.user.upsert({
    where: { email: 'buyer@local.test' },
    update: {},
    create: {
      name: 'Sample Buyer',
      email: 'buyer@local.test',
      passwordHash: buyerPassword,
      role: 'BUYER',
      status: 'ACTIVE',
    },
  });

  await prisma.walletAccount.upsert({
    where: { userId: buyer.id },
    update: {},
    create: {
      userId: buyer.id,
      balanceCents: 50000,
      currency: 'USD',
      status: 'ACTIVE',
    },
  });

  // Create some sample datasets for the seller
  const dataset1 = await prisma.dataset.create({
    data: {
      sellerId: seller.id,
      title: 'US Small Business Leads (Sample)',
      category: 'business',
      description: 'A curated sample of small business contact data for market research and outreach.',
      priceCents: 5000,
      qualityScore: 87,
      licenseType: 'COMMERCIAL',
      sourceCount: 3,
      status: 'PUBLISHED',
      tags: ['leads', 'business', 'usa'],
    },
  });

  const dataset2 = await prisma.dataset.create({
    data: {
      sellerId: seller.id,
      title: 'E-commerce Price History (Sample)',
      category: 'ecommerce',
      description: 'Historical pricing snapshots for popular consumer products (sample dataset).',
      priceCents: 7500,
      qualityScore: 92,
      licenseType: 'COMMERCIAL',
      sourceCount: 5,
      status: 'PUBLISHED',
      tags: ['pricing', 'ecommerce', 'history'],
    },
  });

  // Create an example order: buyer purchases dataset1
  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      datasetId: dataset1.id,
      totalCents: dataset1.priceCents,
      currency: 'USD',
      status: 'PAID',
    },
  });

  // Adjust wallets to reflect the purchase
  // Deduct from buyer
  await prisma.walletAccount.update({
    where: { userId: buyer.id },
    data: { balanceCents: { decrement: dataset1.priceCents } as any },
  });

  // Credit seller (85%) and platform (15%)
  const sellerShare = Math.round(dataset1.priceCents * 0.85);
  const platformShare = dataset1.priceCents - sellerShare;

  await prisma.walletAccount.update({
    where: { userId: seller.id },
    data: { balanceCents: { increment: sellerShare } as any },
  });

  await prisma.walletAccount.update({
    where: { userId: platform.id },
    data: { balanceCents: { increment: platformShare } as any },
  });

  console.log('Seed finished:');
  console.log('  Admin:', { email: admin.email, password: adminPasswordPlain });
  console.log('  Seller:', { email: seller.email, password: sellerPasswordPlain });
  console.log('  Buyer:', { email: buyer.email, password: buyerPasswordPlain });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
