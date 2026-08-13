import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

// Public endpoint — no auth required
// Returns active areas for use in public registration form
export async function GET() {
  try {
    const areas = await prisma.pppoeArea.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ success: true, areas });
  } catch (error) {
    console.error('Get public areas error:', error);
    return NextResponse.json({ success: false, areas: [] }, { status: 500 });
  }
}
