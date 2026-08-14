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
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    let recipient = body.recipient || body.to || '';
    let sender = body.sender || body.from || '';
    let subject = body.subject || '';
    let messageId = body.messageId || '';
    let bodyText = body.bodyText || body.text || '';
    let bodyHtml = body.bodyHtml || body.html || '';
    let size = body.size || 0;
    const rawEmail = body.rawEmail || '';

    // If raw RFC 2822 email is provided, parse it thoroughly
    if (rawEmail && typeof rawEmail === 'string' && rawEmail.length > 10) {
      const parsed = parseRawEmail(rawEmail);
      if (parsed.recipient && !recipient) recipient = parsed.recipient;
      if (parsed.sender && (!sender || sender === 'undefined')) sender = parsed.sender;
      if (parsed.subject && (!subject || subject === '(No Subject)')) subject = parsed.subject;
      if (parsed.messageId && !messageId) messageId = parsed.messageId;
      if (parsed.bodyHtml) bodyHtml = parsed.bodyHtml;
      if (parsed.bodyText) bodyText = parsed.bodyText;
    } else {
      // Fallback: If bodyText or bodyHtml looks like raw MIME multipart
      if (bodyText && bodyText.includes('Content-Type:')) {
        const parsed = parseRawEmail(bodyText);
        if (parsed.bodyHtml) bodyHtml = parsed.bodyHtml;
        if (parsed.bodyText) bodyText = parsed.bodyText;
      }
    }

    // Decode encoded headers (RFC 2047)
    subject = decodeHeaderWords(subject || '(No Subject)').trim();
    sender = decodeHeaderWords(sender || '').trim();

    if (!recipient && !sender) {
      return NextResponse.json({ error: 'Missing required recipient or sender' }, { status: 400 });
    }

    // Extract clean email address (e.g. "User <name@empruy.my.id>" -> "name@empruy.my.id")
    const emailMatch = recipient.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const cleanRecipient = emailMatch ? emailMatch[1].trim().toLowerCase() : recipient.trim().toLowerCase();

    // Find Mailbox
    let mailbox = await prisma.mailbox.findUnique({
      where: { address: cleanRecipient },
    });

    // Fallback: Check plus-addressing (e.g. user+alias@domain.com -> user@domain.com)
    if (!mailbox && cleanRecipient.includes('+')) {
      const [localPart, dom] = cleanRecipient.split('@');
      const baseLocal = localPart.split('+')[0];
      const baseAddress = `${baseLocal}@${dom}`;
      mailbox = await prisma.mailbox.findUnique({
        where: { address: baseAddress },
      });
    }

    if (!mailbox) {
      console.warn(`Mailbox not found for recipient: ${cleanRecipient}`);
      return NextResponse.json({ error: 'Mailbox not found', recipient: cleanRecipient }, { status: 404 });
    }

    if (mailbox.isBanned) {
      return NextResponse.json({ error: 'Mailbox is banned' }, { status: 403 });
    }

    // Sanitize HTML safely
    const cleanHtml = bodyHtml ? sanitizeEmailHtml(bodyHtml) : null;
    const finalBodyText = bodyText ? bodyText.trim() : null;

    // Detect OTP
    const detectedOtp = extractOtpFromEmail(subject, finalBodyText, cleanHtml);

    // Save Email to Database
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

    // System Audit Log with OTP info
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
      console.error('Failed to write log record:', logErr);
    }

    return NextResponse.json({
      success: true,
      emailId: email.id,
      recipient: cleanRecipient,
      otp: detectedOtp || null,
    });
  } catch (err: any) {
    console.error('CRITICAL ERROR in email incoming route:', err);
    return NextResponse.json({
      error: 'Failed to process email',
      message: err?.message || String(err),
    }, { status: 500 });
  }
}
