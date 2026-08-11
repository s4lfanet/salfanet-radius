import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

export async function GET() {
  try {
    const profiles = await prisma.pppoeProfile.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        name: true,
        downloadSpeed: true,
        uploadSpeed: true,
        price: true,
        description: true
      },
      orderBy: {
        price: 'asc'
      }
    });

    return NextResponse.json({
      success: true,
      profiles: profiles
    });
  } catch (error) {
    console.error('Get profiles error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load profiles' },
      { status: 500 }
    );
  }
}
