import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sanitizeEmailHtml } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    let bodyText = '';
    let bodyHtml = '';
    let recipient = '';
    let sender = '';
    let subject = '';
    let messageId = '';
    let size = 0;

    try {
      const json = await req.json();
      recipient = json.recipient || '';
      sender = json.sender || '';
      subject = json.subject || '';
      messageId = json.messageId || '';
      bodyText = json.bodyText || '';
      bodyHtml = json.bodyHtml || '';
      size = json.size || 0;
    } catch (e: any) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    if (!recipient || !sender) {
      return NextResponse.json({ error: 'Recipient and Sender required' }, { status: 400 });
    }

    // Clean recipient string
    const match = recipient.match(/<([^>]+)>/) || [null, recipient];
    const cleanRecipient = (match[1] || recipient).trim().toLowerCase();

    // Find Mailbox
    const mailbox = await prisma.mailbox.findUnique({
      where: { address: cleanRecipient },
    });

    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found', recipient: cleanRecipient }, { status: 404 });
    }

    const cleanHtml = bodyHtml ? sanitizeEmailHtml(bodyHtml) : null;

    // Create Email
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

    // Log received email
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
  } catch (err: any) {
    return NextResponse.json({
      error: 'Webhook handler error',
      details: err?.message || String(err),
    }, { status: 500 });
  }
}
