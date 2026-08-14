import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyAdminSession } from '@/lib/security/auth';
import { verifyDomainDns } from '@/lib/dns/verify';

export async function GET(req: NextRequest) {
  const session = await verifyAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const domains = await prisma.domain.findMany({
      include: {
        _count: {
          select: { mailboxes: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ domains });
  } catch (error) {
    console.error('Error fetching admin domains:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await verifyAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { domain, mxTarget } = await req.json();

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'Valid domain name is required' }, { status: 400 });
    }

    const cleanDomain = domain.trim().toLowerCase();

    const existing = await prisma.domain.findUnique({
      where: { domain: cleanDomain },
    });

    if (existing) {
      return NextResponse.json({ error: 'Domain already registered' }, { status: 400 });
    }

    // Create domain in DB
    const newDomain = await prisma.domain.create({
      data: {
        domain: cleanDomain,
        mxTarget: mxTarget || 'in1-smtp.messagingengine.com',
        status: 'PENDING',
        verificationStatus: 'Pending Verification',
      },
    });

    // Run DNS verification check
    const dnsResult = await verifyDomainDns(newDomain.domain, newDomain.verificationToken);

    const updatedDomain = await prisma.domain.update({
      where: { id: newDomain.id },
      data: {
        status: dnsResult.verified ? 'ACTIVE' : 'PENDING',
        verificationStatus: dnsResult.message,
      },
    });

    await prisma.log.create({
      data: {
        action: 'DOMAIN_ADDED',
        metadata: JSON.stringify({ domain: cleanDomain, verified: dnsResult.verified }),
      },
    });

    return NextResponse.json({
      success: true,
      domain: updatedDomain,
      dnsDetails: dnsResult,
    });
  } catch (error) {
    console.error('Error creating domain:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await verifyAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, status, action } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'Domain ID is required' }, { status: 400 });
    }

    const targetDomain = await prisma.domain.findUnique({ where: { id } });
    if (!targetDomain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    if (action === 'verify') {
      const dnsResult = await verifyDomainDns(targetDomain.domain, targetDomain.verificationToken);

      const updated = await prisma.domain.update({
        where: { id },
        data: {
          status: dnsResult.verified ? 'ACTIVE' : 'PENDING',
          verificationStatus: dnsResult.message,
        },
      });

      return NextResponse.json({ success: true, domain: updated, dnsDetails: dnsResult });
    }

    if (status && ['ACTIVE', 'INACTIVE', 'PENDING', 'ERROR'].includes(status)) {
      const updated = await prisma.domain.update({
        where: { id },
        data: { status },
      });
      return NextResponse.json({ success: true, domain: updated });
    }

    return NextResponse.json({ error: 'Invalid action or status' }, { status: 400 });
  } catch (error) {
    console.error('Error updating domain:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await verifyAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Domain ID is required' }, { status: 400 });
    }

    await prisma.domain.delete({
      where: { id },
    });

    await prisma.log.create({
      data: {
        action: 'DOMAIN_DELETED',
        metadata: JSON.stringify({ domainId: id }),
      },
    });

    return NextResponse.json({ success: true, message: 'Domain deleted successfully' });
  } catch (error) {
    console.error('Error deleting domain:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
