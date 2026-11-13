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

// Supabase's shared transaction pooler (port 6543) does not support
// PostgreSQL prepared statements. Prisma 5 must disable them explicitly.
// Keep each serverless function's local Prisma pool small as well.
function getPrismaDatabaseUrl(url?: string) {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('.pooler.supabase.com')) {
      if (parsed.port === '6543') parsed.searchParams.set('pgbouncer', 'true');
      if (!parsed.searchParams.has('connection_limit')) {
        parsed.searchParams.set('connection_limit', '1');
      }
      return parsed.toString();
    }
  } catch {
    // Leave validation to Prisma so malformed values produce its normal error.
  }

  return url;
}

const prismaDatabaseUrl = getPrismaDatabaseUrl(databaseUrl);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
