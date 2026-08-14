import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sanitizeEmailHtml } from '@/lib/security/sanitize';
import { parseRawEmail, decodeHeaderWords, extractOtpFromEmail } from '@/lib/email/parser';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    let recipient = body.recipient || body.to || '';
    let sender = body.sender || body.from || '';
    let subject = body.subject || '';
    let messageId = body.messageId || '';
    let bodyText = body.bodyText || body.text || '';
    let bodyHtml = body.bodyHtml || body.html || '';
    let size = body.size || 0;
    const rawEmail = body.rawEmail || '';

    // If raw email
    if (rawEmail && typeof rawEmail === 'string' && rawEmail.length > 10) {
      const parsed = parseRawEmail(rawEmail);
      if (parsed.recipient && !recipient) recipient = parsed.recipient;
      if (parsed.sender && (!sender || sender === 'undefined')) sender = parsed.sender;
      if (parsed.subject && (!subject || subject === '(No Subject)')) subject = parsed.subject;
      if (parsed.messageId && !messageId) messageId = parsed.messageId;
      if (parsed.bodyHtml) bodyHtml = parsed.bodyHtml;
      if (parsed.bodyText) bodyText = parsed.bodyText;
    } else {
      if (bodyText && bodyText.includes('Content-Type:')) {
        const parsed = parseRawEmail(bodyText);
        if (parsed.bodyHtml) bodyHtml = parsed.bodyHtml;
        if (parsed.bodyText) bodyText = parsed.bodyText;
      }
    }

    // Decode RFC 2047 headers
    subject = decodeHeaderWords(subject || '(No Subject)').trim();
    sender = decodeHeaderWords(sender || '').trim();

    if (!recipient && !sender) {
      return NextResponse.json({ error: 'Recipient and Sender required' }, { status: 400 });
    }

    // Clean recipient string
    const emailMatch = recipient.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const cleanRecipient = emailMatch ? emailMatch[1].trim().toLowerCase() : recipient.trim().toLowerCase();

    // Find Mailbox
    let mailbox = await prisma.mailbox.findUnique({
      where: { address: cleanRecipient },
    });

    if (!mailbox && cleanRecipient.includes('+')) {
      const [localPart, dom] = cleanRecipient.split('@');
      const baseLocal = localPart.split('+')[0];
      const baseAddress = `${baseLocal}@${dom}`;
      mailbox = await prisma.mailbox.findUnique({
        where: { address: baseAddress },
      });
    }

    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found', recipient: cleanRecipient }, { status: 404 });
    }

    if (mailbox.isBanned) {
      return NextResponse.json({ error: 'Mailbox is banned' }, { status: 403 });
    }

    const cleanHtml = bodyHtml ? sanitizeEmailHtml(bodyHtml) : null;
    const finalBodyText = bodyText ? bodyText.trim() : null;

    // Extract OTP
    const detectedOtp = extractOtpFromEmail(subject, finalBodyText, cleanHtml);

    // Create Email
    const email = await prisma.email.create({
      data: {
        mailboxId: mailbox.id,
        messageId: messageId || null,
        sender: sender || 'Unknown Sender',
        recipient: cleanRecipient,
        subject: subject || '(No Subject)',
        bodyText: finalBodyText,
        bodyHtml: cleanHtml,
        size: typeof size === 'number' ? size : (finalBodyText?.length || 0) + (cleanHtml?.length || 0),
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
            sender: sender || 'Unknown',
            subject: email.subject,
            otp: detectedOtp || null,
          }),
        },
      });
    } catch (logErr) {
      console.error('Failed to log email:', logErr);
    }

    return NextResponse.json({
      success: true,
      emailId: email.id,
      recipient: cleanRecipient,
      otp: detectedOtp || null,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: 'Webhook handler error',
      details: err?.message || String(err),
    }, { status: 500 });
  }
}
