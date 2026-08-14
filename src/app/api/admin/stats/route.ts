import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyAdminSession } from '@/lib/security/auth';

export async function GET(req: NextRequest) {
  const session = await verifyAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    const [
      activeMailboxes,
      totalMailboxes,
      totalEmails,
      totalDomains,
      activeDomains,
      recentLogs,
    ] = await Promise.all([
      prisma.mailbox.count({ where: { expiresAt: { gt: now }, isBanned: false } }),
      prisma.mailbox.count(),
      prisma.email.count(),
      prisma.domain.count(),
      prisma.domain.count({ where: { status: 'ACTIVE' } }),
      prisma.log.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return NextResponse.json({
      activeMailboxes,
      totalMailboxes,
      totalEmails,
      totalDomains,
      activeDomains,
      recentLogs,
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
