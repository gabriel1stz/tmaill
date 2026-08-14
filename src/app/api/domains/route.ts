import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const domains = await prisma.domain.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        domain: true,
      },
      orderBy: { domain: 'asc' },
    });

    return NextResponse.json({ domains });
  } catch (error) {
    console.error('Error fetching public domains:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
