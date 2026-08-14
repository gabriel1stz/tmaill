import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { generateRandomEmailPrefix, generateMailboxToken, hashToken } from '@/lib/security/hash';
import { checkRateLimit } from '@/lib/security/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

    // 1. Check API Key header (Bypass rate limit for bot automation)
    const apiKeyHeader = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    let isApiKeyAuth = false;

    if (apiKeyHeader) {
      const apiKeySetting = await prisma.setting.findUnique({
        where: { key: 'admin_api_key' },
      });
      if (apiKeySetting && apiKeySetting.value && apiKeySetting.value === apiKeyHeader) {
        isApiKeyAuth = true;
      }
    }

    if (!isApiKeyAuth) {
      const limitSetting = await prisma.setting.findUnique({
        where: { key: 'creation_limit_per_hour' },
      });
      const maxLimit = limitSetting ? parseInt(limitSetting.value, 10) : 10;

      const rateLimit = checkRateLimit(`ip:${clientIp}:create_mailbox`, maxLimit, 60 * 60 * 1000);
      if (!rateLimit.success) {
        return NextResponse.json(
          { error: 'Mailbox creation rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }
    }

    // 2. Fetch active domains
    const activeDomains = await prisma.domain.findMany({
      where: { status: 'ACTIVE' },
    });

    if (activeDomains.length === 0) {
      return NextResponse.json(
        { error: 'No active email domains available at the moment. Please contact the administrator.' },
        { status: 503 }
      );
    }

    // Parse optional body parameters
    let customPrefix = '';
    let domainId = '';
    try {
      const body = await req.json();
      if (body?.customPrefix && typeof body.customPrefix === 'string') {
        customPrefix = body.customPrefix.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      }
      if (body?.domainId && typeof body.domainId === 'string') {
        domainId = body.domainId;
      }
    } catch {
      // Body empty or invalid JSON, fallback to defaults
    }

    // Pick domain
    let selectedDomain = activeDomains[Math.floor(Math.random() * activeDomains.length)];
    if (domainId) {
      const targetDomain = activeDomains.find((d) => d.id === domainId);
      if (targetDomain) {
        selectedDomain = targetDomain;
      }
    }

    // 3. Lifetime setting
    const ttlSetting = await prisma.setting.findUnique({
      where: { key: 'mailbox_lifetime_minutes' },
    });
    const ttlMinutes = ttlSetting ? parseInt(ttlSetting.value, 10) : 10080;

    // 4. Generate unique address
    let address = '';
    if (customPrefix && customPrefix.length >= 3) {
      const candidate = `${customPrefix}@${selectedDomain.domain}`;
      const existing = await prisma.mailbox.findUnique({ where: { address: candidate } });
      if (!existing) {
        address = candidate;
      }
    }

    if (!address) {
      let attempts = 0;
      while (attempts < 5) {
        const prefix = generateRandomEmailPrefix(6);
        const candidate = `${prefix}@${selectedDomain.domain}`;
        const existing = await prisma.mailbox.findUnique({ where: { address: candidate } });
        if (!existing) {
          address = candidate;
          break;
        }
        attempts++;
      }
    }

    if (!address) {
      return NextResponse.json(
        { error: 'Could not generate unique email address. Please try again.' },
        { status: 500 }
      );
    }

    // 5. Generate secure token
    const rawToken = generateMailboxToken();
    const accessTokenHash = hashToken(rawToken);

    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const mailbox = await prisma.mailbox.create({
      data: {
        address,
        domainId: selectedDomain.id,
        accessTokenHash,
        expiresAt,
      },
    });

    // Log creation
    await prisma.log.create({
      data: {
        action: 'MAILBOX_CREATED',
        metadata: JSON.stringify({ address, ip: clientIp, expiresAt }),
      },
    });

    return NextResponse.json({
      success: true,
      token: rawToken,
      address: mailbox.address,
      domain: selectedDomain.domain,
      expiresAt: mailbox.expiresAt.toISOString(),
      ttlMinutes,
    });
  } catch (error: any) {
    console.error('Error creating mailbox:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
