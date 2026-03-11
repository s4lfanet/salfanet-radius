import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { nanoid } from 'nanoid';

// GET /api/network/otbs - List OTBs with filters and pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status');
    const oltId = searchParams.get('oltId');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { address: { contains: search } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (oltId) {
      where.oltId = oltId;
    }

    const [otbs, total] = await Promise.all([
      prisma.network_otbs.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          olt: {
            select: {
              id: true,
              name: true,
              ipAddress: true,
            },
          },
          odcs: {
            select: {
              id: true,
              name: true,
              portCount: true,
            },
          },
        },
      }),
      prisma.network_otbs.count({ where }),
    ]);

    return NextResponse.json({
      otbs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[OTB_LIST_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to fetch OTBs', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/network/otbs - Create new OTB
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      code,
      latitude,
      longitude,
      address,
      oltId,
      portCount = 24,
      cableType,
      feederCable,
      hasSplitter = true,
      splitterRatio,
      coverageRadiusKm = 3.0,
      installDate,
      status = 'ACTIVE',
      notes,
      metadata,
      incomingCableId,
      spliceTrayCount = 1,
      totalSpliceCapacity = 24,
    } = body;

    // Validation
    if (!name || !code || !latitude || !longitude) {
      return NextResponse.json(
        { error: 'Name, code, latitude, and longitude are required' },
        { status: 400 }
      );
    }

    // Check if code already exists
    const existing = await prisma.network_otbs.findUnique({
      where: { code },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'OTB code already exists' },
        { status: 409 }
      );
    }

    // ── Validate incomingCableId FK and derive portCount from cable ──────────
    let resolvedPortCount = portCount;
    if (incomingCableId) {
      const cable = await prisma.fiber_cables.findUnique({
        where: { id: incomingCableId },
        select: { id: true, totalCores: true },
      });
      if (!cable) {
        return NextResponse.json(
          { error: `Feeder cable '${incomingCableId}' not found in fiber_cables` },
          { status: 400 }
        );
      }
      // Auto-derive portCount from cable totalCores when not explicitly provided
      if (!body.portCount && cable.totalCores) {
        resolvedPortCount = cable.totalCores;
      }
    }

    // Validate portCount — fall back to 24 (schema default) when not provided/derivable
    const validPortCounts = [12, 24, 48, 96, 144, 288, 576];
    if (resolvedPortCount && !validPortCounts.includes(resolvedPortCount) && !incomingCableId) {
      return NextResponse.json(
        { error: `Invalid port count. Must be one of: ${validPortCounts.join(', ')}` },
        { status: 400 }
      );
    }
    const finalPortCount: number = resolvedPortCount || 24;

    // Create OTB
    const otb = await prisma.network_otbs.create({
      data: {
        id: nanoid(),
        name,
        code,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address,
        ...(oltId ? { olt: { connect: { id: oltId } } } : {}),
        portCount: finalPortCount,
        usedPorts: 0,
        cableType,
        feederCable,
        hasSplitter,
        splitterRatio,
        coverageRadiusKm: parseFloat(coverageRadiusKm || 3.0),
        installDate: installDate ? new Date(installDate) : null,
        status,
        notes,
        metadata,
        incomingCableId: incomingCableId || null,
        spliceTrayCount: parseInt(spliceTrayCount?.toString() || '1'),
        totalSpliceCapacity: parseInt(totalSpliceCapacity?.toString() || '24'),
      },
      include: {
        olt: {
          select: {
            id: true,
            name: true,
            ipAddress: true,
          },
        },
      },
    });

    // 🔄 AUTO-SYNC to network_nodes (Unified Map)
    try {
      const nodeStatus = (otb.status || 'active').toLowerCase() as 'active' | 'inactive' | 'maintenance' | 'damaged';
      await prisma.network_nodes.upsert({
        where: { code: otb.code },
        create: {
          id: otb.id,
          type: 'OTB',
          code: otb.code,
          name: otb.name,
          latitude: otb.latitude,
          longitude: otb.longitude,
          address: otb.address ?? undefined,
          status: nodeStatus,
          upstreamId: otb.oltId ?? undefined,
          metadata: otb.metadata ?? undefined,
        },
        update: {
          name: otb.name,
          latitude: otb.latitude,
          longitude: otb.longitude,
          address: otb.address ?? undefined,
          status: nodeStatus,
          upstreamId: otb.oltId ?? undefined,
        },
      });
    } catch (syncError: any) {
      console.error('⚠️ Failed to sync OTB to network_nodes:', syncError.message);
    }

    return NextResponse.json(otb, { status: 201 });
  } catch (error: any) {
    console.error('[OTB_CREATE_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to create OTB', details: error.message },
      { status: 500 }
    );
  }
}
