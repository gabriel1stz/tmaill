import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Fallback to verified Supabase Transaction Pooler URL (Port 6543) if process.env is missing or invalid
const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://postgres.oxasgimsgjeokdbqcbxz:RiellMail2026%21@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
