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
    });

    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found or token invalid' }, { status: 404 });
    }

    if (new Date() > mailbox.expiresAt || mailbox.isBanned) {
      return NextResponse.json({ error: 'Mailbox expired or banned' }, { status: 410 });
    }

    const emails = await prisma.email.findMany({
      where: { mailboxId: mailbox.id },
      select: {
        id: true,
        sender: true,
        recipient: true,
        subject: true,
        size: true,
        isRead: true,
        receivedAt: true,
        bodyText: true,
      },
      orderBy: { receivedAt: 'desc' },
    });

    // Provide a snippet preview for list UI
    const formattedEmails = emails.map((e) => ({
      ...e,
      snippet: e.bodyText ? e.bodyText.substring(0, 120) : '',
    }));

    return NextResponse.json({
      mailboxAddress: mailbox.address,
      count: formattedEmails.length,
      emails: formattedEmails,
    });
  } catch (error) {
    console.error('Error fetching mailbox emails:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
