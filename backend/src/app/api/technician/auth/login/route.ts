import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import { rateLimit, RateLimitPresets } from '@/server/middleware/rate-limit';
import { isSecureRequest } from '@/server/auth/portal-cookie';

const WRONG = 'Username atau password salah';

// Technicians sign in like collectors: username + password. Accounts from
// Kelola Teknisi (technicians table) come first; technician accounts made in
// Admin & Role before Kelola Teknisi existed still sign in the same way.
export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, RateLimitPresets.strict);
    if (limited) {
      return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi sebentar lagi.' }, { status: 429 });
    }

    const { username, password } = await req.json();

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Username dan password wajib diisi' }, { status: 400 });
    }

    const name = username.trim();
    let session: { payload: Record<string, unknown>; user: Record<string, unknown> } | null = null;

    const tech = await prisma.technician.findFirst({ where: { username: name } });
    if (tech) {
      if (!tech.password || !(await bcrypt.compare(password, tech.password))) {
        return NextResponse.json({ error: WRONG }, { status: 401 });
      }
      if (!tech.isActive) {
        return NextResponse.json({ error: 'Akun tidak aktif' }, { status: 403 });
      }
      await prisma.technician.update({ where: { id: tech.id }, data: { lastLoginAt: new Date() } });
      session = {
        payload: { id: tech.id, username: tech.username, name: tech.name, phoneNumber: tech.phoneNumber, role: 'technician' },
        user: { id: tech.id, username: tech.username, name: tech.name, phone: tech.phoneNumber, email: tech.email },
      };
    } else {
      const user = await prisma.adminUser.findUnique({ where: { username: name } });
      if (!user || user.role !== 'TECHNICIAN' || !(await bcrypt.compare(password, user.password))) {
        return NextResponse.json({ error: WRONG }, { status: 401 });
      }
      if (!user.isActive) {
        return NextResponse.json({ error: 'Akun tidak aktif' }, { status: 403 });
      }
      await prisma.adminUser.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
      session = {
        payload: { id: user.id, username: user.username, name: user.name, phone: user.phone, role: 'technician', type: 'admin_user' },
        user: { id: user.id, username: user.username, name: user.name, phone: user.phone, email: user.email },
      };
    }

    const token = await new SignJWT(session.payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(TECH_JWT_SECRET);

    const response = NextResponse.json({ success: true, message: 'Login berhasil', user: session.user });

    response.cookies.set('technician-token', token, {
      httpOnly: true,
      secure: isSecureRequest(req),
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Technician login error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
