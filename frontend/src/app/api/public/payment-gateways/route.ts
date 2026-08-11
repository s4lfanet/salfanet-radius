import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

export async function GET() {
  try {
    const gateways = await prisma.paymentGateway.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        name: true,
        provider: true,
        isActive: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    console.log('[Payment Gateways API] Found gateways:', gateways.length);
    console.log('[Payment Gateways API] Details:', JSON.stringify(gateways, null, 2));

    return NextResponse.json({
      success: true,
      gateways: gateways
    });
  } catch (error) {
    console.error('Get payment gateways error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load payment gateways' },
      { status: 500 }
    );
  }
}
