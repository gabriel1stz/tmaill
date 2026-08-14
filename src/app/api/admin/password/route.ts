import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyAdminSession } from '@/lib/security/auth';
import { comparePassword, hashPassword } from '@/lib/security/hash';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await verifyAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { currentPassword, newPassword, confirmPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Semua kolom password wajib diisi' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password baru minimal harus 8 karakter' }, { status: 400 });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'Konfirmasi password baru tidak cocok' }, { status: 400 });
    }

    // Find current admin user
    const admin = await prisma.adminUser.findUnique({
      where: { id: session.userId },
    });

    if (!admin) {
      return NextResponse.json({ error: 'Akun admin tidak ditemukan' }, { status: 404 });
    }

    // Verify current password
    const isCurrentValid = await comparePassword(currentPassword, admin.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json({ error: 'Password lama saat ini salah!' }, { status: 400 });
    }

    // Hash and update new password
    const newPasswordHash = await hashPassword(newPassword);
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: newPasswordHash },
    });

    // Log security activity
    await prisma.log.create({
      data: {
        action: 'ADMIN_PASSWORD_CHANGED',
        metadata: JSON.stringify({ email: admin.email, timestamp: new Date().toISOString() }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Password admin berhasil diperbarui!',
    });
  } catch (error: any) {
    console.error('Error changing admin password:', error);
    return NextResponse.json({ error: 'Gagal mengubah password', details: error?.message }, { status: 500 });
  }
}
