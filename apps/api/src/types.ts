export type UserRole = 'buyer' | 'seller' | 'admin';
export type DatasetStatus = 'draft' | 'review' | 'published' | 'archived';
export type LicenseType = 'commercial' | 'personal' | 'enterprise' | 'restricted';
export type PayoutStatus = 'requested' | 'processing' | 'approved' | 'completed' | 'rejected';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  status: 'active' | 'pending_verification' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface WalletAccount {
  id: string;
  userId: string;
  balanceCents: number;
  currency: string;
  status: 'active' | 'locked';
  createdAt: string;
}

export interface Dataset {
  id: string;
  sellerId: string;
  title: string;
  category: string;
  description: string;
  priceCents: number;
  qualityScore: number;
  licenseType: LicenseType;
  sourceCount: number;
  status: DatasetStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  buyerId: string;
  datasetId: string;
  totalCents: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  createdAt: string;
}

export interface PayoutRequest {
  id: string;
  userId: string;
  walletAccountId: string;
  amountCents: number;
  method: 'bank_transfer' | 'wire' | 'stripe';
  destinationAccount: string;
  status: PayoutStatus;
  requestedAt: string;
  processedAt?: string;
}
