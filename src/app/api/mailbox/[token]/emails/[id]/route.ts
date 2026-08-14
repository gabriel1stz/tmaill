import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { hashToken } from '@/lib/security/hash';
import { extractOtpFromEmail } from '@/lib/email/parser';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string; id: string } }
) {
  try {
    const { token: rawToken, id: emailId } = params;
    if (!rawToken || !emailId) {
      return NextResponse.json({ error: 'Missing token or email ID' }, { status: 400 });
    }

    const accessTokenHash = hashToken(rawToken);
    const mailbox = await prisma.mailbox.findFirst({
      where: { accessTokenHash },
    });

    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found or token invalid' }, { status: 404 });
    }

    const email = await prisma.email.findFirst({
      where: {
        id: emailId,
        mailboxId: mailbox.id,
      },
    });

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Mark email as read if not already
    if (!email.isRead) {
      await prisma.email.update({
        where: { id: email.id },
        data: { isRead: true },
      });
    }

    // Extract OTP for prominent banner display
    const otp = extractOtpFromEmail(email.subject, email.bodyText, email.bodyHtml);

    return NextResponse.json({
      ...email,
      isRead: true,
      otp,
    });
  } catch (error) {
    console.error('Error fetching email details:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { token: string; id: string } }
) {
  try {
    const { token: rawToken, id: emailId } = params;
    if (!rawToken || !emailId) {
      return NextResponse.json({ error: 'Missing token or email ID' }, { status: 400 });
    }

    const accessTokenHash = hashToken(rawToken);
    const mailbox = await prisma.mailbox.findFirst({
      where: { accessTokenHash },
    });

    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
    }

    const email = await prisma.email.findFirst({
      where: {
        id: emailId,
        mailboxId: mailbox.id,
      },
    });

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    await prisma.email.delete({
      where: { id: emailId },
    });

    return NextResponse.json({ success: true, message: 'Email deleted successfully' });
  } catch (error) {
    console.error('Error deleting email:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
