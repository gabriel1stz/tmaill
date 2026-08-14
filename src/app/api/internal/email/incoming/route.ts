import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sanitizeEmailHtml } from '@/lib/security/sanitize';

export async function POST(req: NextRequest) {
  try {
    // 1. Verify Secret Header
    const secretHeader = req.headers.get('x-email-handler-secret');
    const expectedSecret = process.env.EMAIL_HANDLER_SECRET;

    if (expectedSecret && secretHeader !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized webhook request' }, { status: 401 });
    }

    // 2. Parse Body
    const body = await req.json();
    const { recipient, sender, subject, messageId, bodyText, bodyHtml, size } = body;

    if (!recipient || !sender) {
      return NextResponse.json({ error: 'Missing required email fields (recipient, sender)' }, { status: 400 });
    }

    // Extract clean email address from string (e.g. "Name <address@domain.com>" -> "address@domain.com")
    const match = recipient.match(/<([^>]+)>/) || [null, recipient];
    const cleanRecipient = (match[1] || recipient).trim().toLowerCase();

    // 3. Find Mailbox
    const mailbox = await prisma.mailbox.findUnique({
      where: { address: cleanRecipient },
      include: { domain: true },
    });

    if (!mailbox) {
      console.warn(`Incoming email for unknown mailbox: ${cleanRecipient}`);
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
    }

    // Check ban or expiration
    if (mailbox.isBanned) {
      return NextResponse.json({ error: 'Mailbox is banned' }, { status: 403 });
    }

    if (new Date() > mailbox.expiresAt) {
      return NextResponse.json({ error: 'Mailbox has expired' }, { status: 410 });
    }

    // 4. Sanitize HTML
    const cleanHtml = bodyHtml ? sanitizeEmailHtml(bodyHtml) : null;

    // 5. Create Email Record
    const email = await prisma.email.create({
      data: {
        mailboxId: mailbox.id,
        messageId: messageId || null,
        sender: sender.trim(),
        recipient: cleanRecipient,
        subject: (subject || '(No Subject)').trim(),
        bodyText: bodyText || null,
        bodyHtml: cleanHtml,
        size: typeof size === 'number' ? size : 0,
      },
    });

    // 6. Log activity
    await prisma.log.create({
      data: {
        action: 'EMAIL_RECEIVED',
        metadata: JSON.stringify({
          emailId: email.id,
          recipient: cleanRecipient,
          sender: sender.trim(),
          subject: email.subject,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      emailId: email.id,
      recipient: cleanRecipient,
    });
  } catch (error: any) {
    console.error('Error processing incoming email webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
