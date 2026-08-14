import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyDomainDns } from '@/lib/dns/verify';
import { checkRateLimit } from '@/lib/security/rate-limit';

// Public endpoint: anyone can add their own domain
export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

    // Rate limit: 3 domain adds per hour per IP
    const rateLimit = checkRateLimit(`ip:${clientIp}:add_domain`, 3, 60 * 60 * 1000);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
        { status: 429 }
      );
    }

    const { domain } = await req.json();

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'Nama domain wajib diisi.' }, { status: 400 });
    }

    const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '');

    // Basic domain format validation
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(cleanDomain)) {
      return NextResponse.json({ error: 'Format domain tidak valid.' }, { status: 400 });
    }

    // Check if domain already exists
    const existing = await prisma.domain.findUnique({
      where: { domain: cleanDomain },
    });

    if (existing) {
      // If already active, just return success with instructions
      if (existing.status === 'ACTIVE') {
        return NextResponse.json({
          success: true,
          alreadyActive: true,
          domain: cleanDomain,
          message: `Domain @${cleanDomain} sudah aktif dan siap dipakai!`,
        });
      }

      // If pending, re-verify
      const dnsResult = await verifyDomainDns(cleanDomain, existing.verificationToken);

      const updated = await prisma.domain.update({
        where: { id: existing.id },
        data: {
          status: dnsResult.verified ? 'ACTIVE' : 'PENDING',
          verificationStatus: dnsResult.message,
        },
      });

      return NextResponse.json({
        success: true,
        alreadyActive: updated.status === 'ACTIVE',
        domain: cleanDomain,
        status: updated.status,
        mxTarget: updated.mxTarget,
        dnsDetails: dnsResult,
        message: dnsResult.verified
          ? `Domain @${cleanDomain} terverifikasi dan aktif!`
          : `MX record belum terdeteksi untuk @${cleanDomain}. Pastikan sudah disetting.`,
      });
    }

    // Fetch default MX target from settings or use default
    const mxSetting = await prisma.setting.findUnique({
      where: { key: 'default_mx_target' },
    });
    const mxTarget = mxSetting?.value || 'in1-smtp.messagingengine.com';

    // Create new domain entry
    const newDomain = await prisma.domain.create({
      data: {
        domain: cleanDomain,
        mxTarget,
        status: 'PENDING',
        verificationStatus: 'Menunggu verifikasi MX record',
      },
    });

    // Immediately try to verify
    const dnsResult = await verifyDomainDns(cleanDomain, newDomain.verificationToken);

    if (dnsResult.verified) {
      await prisma.domain.update({
        where: { id: newDomain.id },
        data: {
          status: 'ACTIVE',
          verificationStatus: dnsResult.message,
        },
      });
    }

    await prisma.log.create({
      data: {
        action: 'PUBLIC_DOMAIN_ADDED',
        metadata: JSON.stringify({ domain: cleanDomain, ip: clientIp, verified: dnsResult.verified }),
      },
    });

    return NextResponse.json({
      success: true,
      alreadyActive: dnsResult.verified,
      domain: cleanDomain,
      status: dnsResult.verified ? 'ACTIVE' : 'PENDING',
      mxTarget,
      dnsDetails: dnsResult,
      message: dnsResult.verified
        ? `Domain @${cleanDomain} langsung terverifikasi dan aktif!`
        : `Domain @${cleanDomain} didaftarkan. Silakan setting MX record dulu.`,
    });
  } catch (error) {
    console.error('Error adding public domain:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
