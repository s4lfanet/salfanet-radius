import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

export async function GET(req: NextRequest) {
  try {
    // Get token from cookie
    const token = req.cookies.get('technician-token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Verify JWT
    const secret = TECH_JWT_SECRET;

    const { payload } = await jwtVerify(token, secret);

    // Support both admin_user (username/password) and legacy technician (OTP) tokens
    if (payload.type === 'admin_user') {
      const user = await prisma.adminUser.findUnique({
        where: { id: payload.id as string },
        select: {
          id: true,
          name: true,
          username: true,
          phone: true,
          email: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        return NextResponse.json(
          { error: 'User not found or inactive' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        technician: {
          id: user.id,
          name: user.name,
          phoneNumber: user.phone || user.username,
          email: user.email,
        },
      });
    }

    // Legacy: OTP-based technician token
    const technician = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!technician || !technician.isActive) {
      return NextResponse.json(
        { error: 'Technician not found or inactive' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      technician,
    });
  } catch (error) {
    console.error('Get technician session error:', error);
    return NextResponse.json(
      { error: 'Invalid or expired session' },
      { status: 401 }
    );
  }
}
