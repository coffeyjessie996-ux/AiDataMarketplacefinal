import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Prefer DATABASE_URL only when it is a usable PostgreSQL URL. A stale or
// placeholder DATABASE_URL must not hide a valid Supabase pooler fallback.
const databaseUrl = [
  process.env.DATABASE_URL,
  process.env.SUPABASE_POOLER_URL,
  process.env.POSTGRES_PRISMA_URL,
]
  .map((url) => url?.trim())
  .find((url) => url?.startsWith('postgresql://') || url?.startsWith('postgres://'));

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
