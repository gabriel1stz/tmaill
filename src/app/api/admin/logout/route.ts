import { NextResponse } from 'next/server';
import { clearAdminCookie } from '@/lib/security/auth';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  return clearAdminCookie(response);
}
