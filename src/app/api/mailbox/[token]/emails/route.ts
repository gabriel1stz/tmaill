import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { hashToken } from '@/lib/security/hash';
import { extractOtpFromEmail } from '@/lib/email/parser';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
        bodyHtml: true,
      },
      orderBy: { receivedAt: 'desc' },
    });

    // Provide clean snippet and extract OTP for instant UI display
    const formattedEmails = emails.map((e) => {
      const otp = extractOtpFromEmail(e.subject, e.bodyText, e.bodyHtml);
      let snippet = e.bodyText ? e.bodyText.substring(0, 140) : '';
      if (!snippet && e.bodyHtml) {
        snippet = e.bodyHtml
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 140);
      }

      return {
        id: e.id,
        sender: e.sender,
        recipient: e.recipient,
        subject: e.subject,
        size: e.size,
        isRead: e.isRead,
        receivedAt: e.receivedAt,
        snippet,
        otp,
      };
    });

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
