import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Prefer the project's current DATABASE_URL. Keep the older pooler variables
// as fallbacks for deployments that have not migrated their environment yet.
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.SUPABASE_POOLER_URL ??
  process.env.POSTGRES_PRISMA_URL;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
