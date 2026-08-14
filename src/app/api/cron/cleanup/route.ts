import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const secretParam = req.nextUrl.searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET || process.env.EMAIL_HANDLER_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
    }

    const now = new Date();

    // 1. Delete expired mailboxes (Prisma cascade deletes associated emails)
    const result = await prisma.mailbox.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });

    // 2. Log cleanup
    await prisma.log.create({
      data: {
        action: 'CRON_CLEANUP',
        metadata: JSON.stringify({
          deletedMailboxesCount: result.count,
          executedAt: now.toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      deletedMailboxes: result.count,
      executedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('Error executing cron cleanup:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
