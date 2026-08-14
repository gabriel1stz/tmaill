import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sanitizeEmailHtml } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const recipient = body.recipient || body.to || '';
    const sender = body.sender || body.from || '';
    const subject = body.subject || '(No Subject)';
    const messageId = body.messageId || '';
    const bodyText = body.bodyText || body.text || '';
    const bodyHtml = body.bodyHtml || body.html || '';
    const size = body.size || 0;

    if (!recipient || !sender) {
      return NextResponse.json({ error: 'Missing required recipient or sender' }, { status: 400 });
    }

    // Extract clean email (e.g. "User <name@empruy.my.id>" -> "name@empruy.my.id")
    const match = recipient.match(/<([^>]+)>/) || [null, recipient];
    const cleanRecipient = (match[1] || recipient).trim().toLowerCase();

    // Find Mailbox
    const mailbox = await prisma.mailbox.findUnique({
      where: { address: cleanRecipient },
    });

    if (!mailbox) {
      console.log(`Mailbox not found for: ${cleanRecipient}`);
      return NextResponse.json({ error: 'Mailbox not found', recipient: cleanRecipient }, { status: 404 });
    }

    if (mailbox.isBanned) {
      return NextResponse.json({ error: 'Mailbox is banned' }, { status: 403 });
    }

    // Sanitize HTML safely
    const cleanHtml = bodyHtml ? sanitizeEmailHtml(bodyHtml) : null;

    // Save Email
    const email = await prisma.email.create({
      data: {
        mailboxId: mailbox.id,
        messageId: messageId || null,
        sender: sender.trim(),
        recipient: cleanRecipient,
        subject: subject.trim(),
        bodyText: bodyText || null,
        bodyHtml: cleanHtml,
        size: typeof size === 'number' ? size : 0,
      },
    });

    // Log received email
    try {
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
    } catch (logErr) {
      console.error('Failed to write log record:', logErr);
    }

    return NextResponse.json({
      success: true,
      emailId: email.id,
      recipient: cleanRecipient,
    });
  } catch (err: any) {
    console.error('CRITICAL ERROR in email incoming route:', err);
    return NextResponse.json({
      error: 'Failed to process email',
      message: err?.message || String(err),
    }, { status: 500 });
  }
}
