import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { hashToken } from '@/lib/security/hash';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const rawToken = params.token;
    if (!rawToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const accessTokenHash = hashToken(rawToken);
    const mailbox = await prisma.mailbox.findFirst({
      where: { accessTokenHash },
      include: { domain: true },
    });

    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found or token invalid' }, { status: 404 });
    }

    const now = new Date();
    const isExpired = now > mailbox.expiresAt || mailbox.isBanned;
    const remainingSeconds = Math.max(0, Math.floor((mailbox.expiresAt.getTime() - now.getTime()) / 1000));

    return NextResponse.json({
      address: mailbox.address,
      domain: mailbox.domain.domain,
      expiresAt: mailbox.expiresAt.toISOString(),
      remainingSeconds,
      isExpired,
      isBanned: mailbox.isBanned,
    });
  } catch (error) {
    console.error('Error fetching mailbox:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
