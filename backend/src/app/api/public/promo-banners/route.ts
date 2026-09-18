import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

// GET - Active promo banners for the customer-facing slideshow, in display order.
export async function GET() {
  try {
    const banners = await prisma.promoBanner.findMany({
      where: { isActive: true },
      select: {
        id: true,
        imageUrl: true,
        linkUrl: true,
        title: true,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, banners });
  } catch (error) {
    console.error('Get promo banners error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load promo banners' },
      { status: 500 }
    );
  }
}
