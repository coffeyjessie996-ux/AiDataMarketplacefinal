import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Vercel serverless functions should use Supabase's shared transaction pooler.
// Keep the existing variables as fallbacks for local development and legacy deployments.
const databaseUrl =
  process.env.SUPABASE_POOLER_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
