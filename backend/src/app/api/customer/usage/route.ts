import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

/**
 * Get Customer Usage Statistics
 * GET /api/customer/usage
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Find session by token
    const session = await prisma.customerSession.findFirst({
      where: {
        token,
        verified: true,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Get user
    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      select: {
        username: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    // Get usage stats for current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const usageStats = await prisma.radacct.aggregate({
      where: {
        username: user.username,
        acctstarttime: {
          gte: startOfMonth,
        },
      },
      _sum: {
        acctinputoctets: true,
        acctoutputoctets: true,
      },
    });

    const downloadBytes = Number(usageStats._sum.acctoutputoctets || 0);
    const uploadBytes = Number(usageStats._sum.acctinputoctets || 0);
    const totalBytes = downloadBytes + uploadBytes;

    return NextResponse.json({
      success: true,
      data: {
        upload: uploadBytes,
        download: downloadBytes,
        total: totalBytes,
        period: {
          start: startOfMonth.toISOString(),
          end: now.toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error('Get customer usage error:', error);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan', error: error.message },
      { status: 500 }
    );
  }
}
