import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyAdminSession } from '@/lib/security/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await verifyAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const start = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Math.round(performance.now() - start);

    const now = new Date();
    const expiredMailboxesCount = await prisma.mailbox.count({
      where: { expiresAt: { lte: now } },
    });

    const totalLogsCount = await prisma.log.count();

    return NextResponse.json({
      status: 'healthy',
      dbLatencyMs,
      expiredMailboxesCount,
      totalLogsCount,
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'unhealthy',
      error: error?.message || 'DB connection issue',
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await verifyAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action } = await req.json();
    const now = new Date();

    if (action === 'purge_expired') {
      const deleted = await prisma.mailbox.deleteMany({
        where: { expiresAt: { lte: now } },
      });

      await prisma.log.create({
        data: {
          action: 'MAINTENANCE_PURGE_MAILBOXES',
          metadata: JSON.stringify({ count: deleted.count, performedBy: session.email }),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Berhasil membersihkan ${deleted.count} mailbox yang sudah hangus!`,
        count: deleted.count,
      });
    }

    if (action === 'clear_logs') {
      const deleted = await prisma.log.deleteMany();

      return NextResponse.json({
        success: true,
        message: `Berhasil menghapus ${deleted.count} log aktivitas!`,
        count: deleted.count,
      });
    }

    return NextResponse.json({ error: 'Aksi maintenance tidak valid' }, { status: 400 });
  } catch (error: any) {
    console.error('Maintenance error:', error);
    return NextResponse.json({ error: 'Gagal menjalankan pemeliharaan sistem', details: error?.message }, { status: 500 });
  }
}
