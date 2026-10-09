import { Dataset, Order, PayoutRequest, User, WalletAccount } from '../types';

export const users: User[] = [
  {
    id: 'user-seller-1',
    name: 'Ava Seller',
    email: 'seller@aidata.com',
    password: 'demo123',
    role: 'seller',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'user-buyer-1',
    name: 'Morgan Buyer',
    email: 'buyer@aidata.com',
    password: 'demo123',
    role: 'buyer',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'user-admin-1',
    name: 'Ops Admin',
    email: 'admin@aidata.com',
    password: 'demo123',
    role: 'admin',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const walletAccounts: WalletAccount[] = [
  {
    id: 'wallet-user-seller-1',
    userId: 'user-seller-1',
    balanceCents: 450000,
    currency: 'USD',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'wallet-user-buyer-1',
    userId: 'user-buyer-1',
    balanceCents: 240000,
    currency: 'USD',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'wallet-user-admin-1',
    userId: 'user-admin-1',
    balanceCents: 780000,
    currency: 'USD',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'wallet-platform',
    userId: 'platform',
    balanceCents: 1250000,
    currency: 'USD',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
];

export const datasets: Dataset[] = [
  {
    id: 'dataset-1',
    sellerId: 'user-seller-1',
    title: 'Global AI Hiring Signal Index',
    category: 'talent-intelligence',
    description: 'Normalized hiring trends across major markets and roles, updated weekly.',
    priceCents: 29900,
    qualityScore: 97,
    licenseType: 'commercial',
    sourceCount: 18,
    status: 'published',
    tags: ['hiring', 'ai', 'talent'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'dataset-2',
    sellerId: 'user-seller-1',
    title: 'SaaS Pricing Benchmark Dataset',
    category: 'market-research',
    description: 'Structured pricing tables and positioning signals for software categories.',
    priceCents: 39900,
    qualityScore: 94,
    licenseType: 'enterprise',
    sourceCount: 26,
    status: 'published',
    tags: ['pricing', 'saas', 'benchmark'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const orders: Order[] = [
  {
    id: 'order-1',
    buyerId: 'user-buyer-1',
    datasetId: 'dataset-1',
    totalCents: 29900,
    currency: 'USD',
    status: 'paid',
    createdAt: new Date().toISOString(),
  },
];

export const payouts: PayoutRequest[] = [
  {
    id: 'payout-1',
    userId: 'user-seller-1',
    walletAccountId: 'wallet-user-seller-1',
    amountCents: 125000,
    method: 'bank_transfer',
    destinationAccount: '**** 2847',
    status: 'processing',
    requestedAt: new Date().toISOString(),
  },
];

export function findUserByEmail(email: string) {
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export function findWalletForUser(userId: string) {
  return walletAccounts.find((wallet) => wallet.userId === userId);
}

export function findPlatformWallet() {
  return walletAccounts.find((wallet) => wallet.userId === 'platform');
}

export function getDashboardSnapshot() {
  const totalRevenue = orders
    .filter((order) => order.status === 'paid')
    .reduce((sum, order) => sum + order.totalCents, 0);

  const totalWalletBalance = walletAccounts.reduce((sum, wallet) => sum + wallet.balanceCents, 0);

  return {
    totalRevenueCents: totalRevenue,
    totalDatasets: datasets.length,
    activeOrders: orders.filter((order) => order.status === 'paid').length,
    pendingPayouts: payouts.filter((payout) => payout.status !== 'completed').length,
    platformLiquidityCents: totalWalletBalance,
    updatedAt: new Date().toISOString(),
  };
}

export function createSeedUserIfMissing(user: User) {
  if (!users.some((existing) => existing.email === user.email)) {
    users.push(user);
  }
}
