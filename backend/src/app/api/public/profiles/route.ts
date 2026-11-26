import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

export async function GET() {
  try {
    const profiles = await prisma.pppoeProfile.findMany({
      where: {
        isActive: true,
        hiddenFromPublic: false,
      },
      select: {
        id: true,
        name: true,
        downloadSpeed: true,
        uploadSpeed: true,
        price: true,
        description: true,
        ppnActive: true,
        ppnRate: true,
      },
      orderBy: {
        price: 'asc'
      }
    });

    return NextResponse.json({
      success: true,
      // displayPrice = what the customer actually pays (price + PPN when the
      // profile has PPN). The pre-tax price is not shown to customers.
      profiles: profiles.map(({ ppnActive, ppnRate, ...p }) => ({
        ...p,
        ppnRate: ppnActive ? ppnRate : 0,
        displayPrice: ppnActive && ppnRate > 0 ? Math.round(p.price + (p.price * ppnRate) / 100) : p.price,
      })),
    });
  } catch (error) {
    console.error('Get profiles error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load profiles' },
      { status: 500 }
    );
  }
}
