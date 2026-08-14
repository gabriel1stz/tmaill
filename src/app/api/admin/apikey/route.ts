import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyAdminSession } from '@/lib/security/auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function generateApiKey(): string {
  return `rm_live_${crypto.randomBytes(24).toString('hex')}`;
}

export async function GET(req: NextRequest) {
  const session = await verifyAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let setting = await prisma.setting.findUnique({
      where: { key: 'admin_api_key' },
    });

    if (!setting || !setting.value) {
      const newKey = generateApiKey();
      setting = await prisma.setting.upsert({
        where: { key: 'admin_api_key' },
        update: { value: newKey },
        create: { key: 'admin_api_key', value: newKey },
      });
    }

    return NextResponse.json({
      apiKey: setting.value,
      createdAt: setting.updatedAt,
    });
  } catch (error: any) {
    console.error('Error fetching API key:', error);
    return NextResponse.json({ error: 'Failed to fetch API key' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await verifyAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const newKey = generateApiKey();
    const setting = await prisma.setting.upsert({
      where: { key: 'admin_api_key' },
      update: { value: newKey },
      create: { key: 'admin_api_key', value: newKey },
    });

    await prisma.log.create({
      data: {
        action: 'API_KEY_ROTATED',
        metadata: JSON.stringify({ rotatedBy: session.email, time: new Date().toISOString() }),
      },
    });

    return NextResponse.json({
      success: true,
      apiKey: setting.value,
      message: 'API Key baru berhasil dibuat / dirotasi!',
    });
  } catch (error: any) {
    console.error('Error rotating API key:', error);
    return NextResponse.json({ error: 'Failed to rotate API key' }, { status: 500 });
  }
}
