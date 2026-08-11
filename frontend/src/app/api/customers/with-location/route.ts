import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

/**
 * GET /api/customers/with-location
 * Fetch all customers with GPS coordinates for unified map display
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '1000');

    const where: any = {
      latitude: { not: null },
      longitude: { not: null },
    };

    if (status) {
      where.status = status;
    }

    const customers = await prisma.pppoeUser.findMany({
      where,
      select: {
        id: true,
        username: true,
        name: true,
        latitude: true,
        longitude: true,
        status: true,
        address: true,
        profile: {
          select: {
            name: true,
            downloadSpeed: true,
            uploadSpeed: true,
          },
        },
        odpAssignment: {
          select: {
            odpId: true,
            portNumber: true,
            odp: {
              select: {
                id: true,
                name: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const data = customers.map((c) => ({
      id: c.id,
      username: c.username,
      name: c.name || c.username,
      latitude: c.latitude,
      longitude: c.longitude,
      address: c.address,
      status: c.status,
      pppoe_profiles: c.profile?.name || 'Unknown',
      speed: c.profile?.downloadSpeed ? `${c.profile.downloadSpeed} Mbps` : 'N/A',
      odpId: c.odpAssignment?.odpId || null,
      odpName: c.odpAssignment?.odp?.name || null,
      odpCoordinates: c.odpAssignment?.odp
        ? { latitude: c.odpAssignment.odp.latitude, longitude: c.odpAssignment.odp.longitude }
        : null,
    }));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (error: any) {
    console.error('[customers/with-location] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch customers with location' },
      { status: 500 }
    );
  }
}
