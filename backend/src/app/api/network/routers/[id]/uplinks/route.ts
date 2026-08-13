import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/server/db/client';

// GET - Get uplink connections for a router
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routerId } = await params;

    const connections = await prisma.networkOLTRouter.findMany({
      where: { routerId },
      include: {
        olt: true,
      },
      orderBy: { priority: 'asc' },
    });

    return NextResponse.json({
      success: true,
      connections: connections.map((c: typeof connections[0]) => ({
        id: c.id,
        oltId: c.oltId,
        oltName: c.olt.name,
        oltIp: c.olt.ipAddress,
        oltLatitude: c.olt.latitude,
        oltLongitude: c.olt.longitude,
        uplinkPort: c.uplinkPort,
        priority: c.priority,
        isActive: c.isActive,
        createdAt: c.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Get uplinks error:', error);
    return NextResponse.json(
      { error: 'Failed to get uplink connections', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Add new uplink connection
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routerId } = await params;
    const body = await request.json();
    const { oltId, uplinkPort, priority = 0 } = body;

    if (!oltId) {
      return NextResponse.json({ error: 'OLT ID is required' }, { status: 400 });
    }

    // Check if router exists
    const router = await prisma.router.findUnique({ where: { id: routerId } });
    if (!router) {
      return NextResponse.json({ error: 'Router not found' }, { status: 404 });
    }

    // Check if OLT exists
    const olt = await prisma.networkOLT.findUnique({ where: { id: oltId } });
    if (!olt) {
      return NextResponse.json({ error: 'OLT not found' }, { status: 404 });
    }

    // Check if connection already exists
    const existing = await prisma.networkOLTRouter.findUnique({
      where: { oltId_routerId: { oltId, routerId } },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Connection already exists between this router and OLT' },
        { status: 400 }
      );
    }

    const connection = await prisma.networkOLTRouter.create({
      data: {
        id: crypto.randomUUID(),
        oltId,
        routerId,
        uplinkPort,
        priority,
        isActive: true,
      },
      include: {
        olt: true,
        router: true,
      },
    });

    return NextResponse.json({
      success: true,
      connection: {
        id: connection.id,
        oltId: connection.oltId,
        oltName: connection.olt.name,
        routerId: connection.routerId,
        routerName: connection.router.name,
        uplinkPort: connection.uplinkPort,
        priority: connection.priority,
        isActive: connection.isActive,
      },
    });
  } catch (error: any) {
    console.error('Add uplink error:', error);
    return NextResponse.json(
      { error: 'Failed to add uplink connection', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update uplink connection
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routerId } = await params;
    const body = await request.json();
    const { connectionId, oltId, uplinkPort, priority, isActive } = body;

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    const connection = await prisma.networkOLTRouter.update({
      where: { id: connectionId },
      data: {
        ...(uplinkPort !== undefined && { uplinkPort }),
        ...(priority !== undefined && { priority }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        olt: true,
      },
    });

    return NextResponse.json({
      success: true,
      connection: {
        id: connection.id,
        oltId: connection.oltId,
        oltName: connection.olt.name,
        uplinkPort: connection.uplinkPort,
        priority: connection.priority,
        isActive: connection.isActive,
      },
    });
  } catch (error: any) {
    console.error('Update uplink error:', error);
    return NextResponse.json(
      { error: 'Failed to update uplink connection', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Remove uplink connection
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    await prisma.networkOLTRouter.delete({
      where: { id: connectionId },
    });

    return NextResponse.json({
      success: true,
      message: 'Uplink connection removed',
    });
  } catch (error: any) {
    console.error('Delete uplink error:', error);
    return NextResponse.json(
      { error: 'Failed to delete uplink connection', details: error.message },
      { status: 500 }
    );
  }
}
