import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import bcrypt from 'bcryptjs';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

async function getTechUser(req: NextRequest) {
  const token = req.cookies.get('technician-token')?.value;
  if (!token) return null;
  const secret = TECH_JWT_SECRET;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.type === 'admin_user') {
      return { id: payload.id as string, type: 'admin_user' as const };
    }
    return { id: payload.id as string, type: 'technician' as const };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getTechUser(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (auth.type === 'admin_user') {
      const user = await prisma.adminUser.findUnique({
        where: { id: auth.id },
        select: { id: true, username: true, name: true, email: true, phone: true, createdAt: true },
      });
      if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ success: true, profile: user });
    }

    const tech = await prisma.technician.findUnique({
      where: { id: auth.id },
      select: { id: true, name: true, phoneNumber: true, email: true, createdAt: true },
    });
    if (!tech) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, profile: { ...tech, username: tech.phoneNumber, phone: tech.phoneNumber } });
  } catch (error) {
    console.error('Get technician profile error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await getTechUser(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { name, email, phone, currentPassword, newPassword } = body;

    if (auth.type === 'admin_user') {
      const user = await prisma.adminUser.findUnique({ where: { id: auth.id } });
      if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      // Password change
      if (newPassword) {
        if (!currentPassword) {
          return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
        }
        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
          return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
        }
        const hashed = await bcrypt.hash(newPassword, 10);
        await prisma.adminUser.update({ where: { id: auth.id }, data: { password: hashed } });
        return NextResponse.json({ success: true, message: 'Password changed' });
      }

      // Profile update
      const updateData: Record<string, string> = {};
      if (name) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;

      await prisma.adminUser.update({ where: { id: auth.id }, data: updateData });
      return NextResponse.json({ success: true, message: 'Profile updated' });
    }

    // Legacy technician model
    const updateData: Record<string, string> = {};
    if (name) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    await prisma.technician.update({ where: { id: auth.id }, data: updateData });
    return NextResponse.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    console.error('Update technician profile error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
