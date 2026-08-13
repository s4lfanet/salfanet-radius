import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

// Helper to verify customer token using CustomerSession
async function verifyCustomerToken(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return null;
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
      return null;
    }

    const user = await prisma.pppoeUser.findUnique({
      where: { id: session.userId },
      include: { profile: true }
    });

    return user;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

// GET - Get available internet packages
export async function GET(request: NextRequest) {
  try {
    const user = await verifyCustomerToken(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // For customer renewal flow, only expose the customer's current active package.
    // This prevents selecting other packages from the renewal page.
    const packages = user.profile
      ? [{
          id: user.profile.id,
          name: user.profile.name,
          downloadSpeed: user.profile.downloadSpeed,
          uploadSpeed: user.profile.uploadSpeed,
          price: user.profile.price,
          description: user.profile.description,
        }]
      : [];

    return NextResponse.json({
      success: true,
      packages
    });

  } catch (error: any) {
    console.error('Get packages error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
