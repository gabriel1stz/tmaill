import { prisma } from '../src/lib/db/prisma';

async function test() {
  try {
    const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
    console.log('Database tables:', tables);
  } catch (err) {
    console.error('Error querying tables:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
