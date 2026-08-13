import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET /api/network/nodes - Fetch all network nodes with filtering
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type'); // OLT, ODC, ODP, JOINT_CLOSURE
    const status = searchParams.get('status'); // active, inactive, maintenance, damaged
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const search = searchParams.get('search');

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { code: { contains: search } },
        { name: { contains: search } },
        { address: { contains: search } },
      ];
    }

    // Fetch nodes
    const [nodes, total] = await Promise.all([
      prisma.network_nodes.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
      }),
      prisma.network_nodes.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: nodes.map((node) => ({
        id: node.id,
        type: node.type,
        code: node.code,
        name: node.name,
        latitude: node.latitude,
        longitude: node.longitude,
        address: node.address,
        status: node.status,
        upstreamId: node.upstreamId,
        metadata: node.metadata,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[Network Nodes API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch network nodes', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/network/nodes - Create new network node
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      type,
      code,
      name,
      latitude,
      longitude,
      address,
      status = 'active',
      upstreamId,
      capacity,
      metadata,
    } = body;

    // Validation
    if (!type || !code || !name || !latitude || !longitude) {
      return NextResponse.json(
        { error: 'Missing required fields: type, code, name, latitude, longitude' },
        { status: 400 }
      );
    }

    // Check for duplicate code
    const existing = await prisma.network_nodes.findFirst({
      where: { code },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Node with code '${code}' already exists` },
        { status: 409 }
      );
    }

    // Calculate ports based on type and capacity
    let availablePorts = 0;
    if (type === 'OLT') {
      availablePorts = capacity || 16; // Default OLT capacity
    } else if (type === 'ODC') {
      const ratio = metadata?.splitterRatio || '1:16';
      availablePorts = parseInt(ratio.split(':')[1]);
    } else if (type === 'ODP') {
      availablePorts = 8; // Default ODP capacity
    } else if (type === 'JOINT_CLOSURE') {
      const ratio = metadata?.splitterRatio || '2:16';
      availablePorts = parseInt(ratio.split(':')[1]);
    }

    // Create node
    const node = await prisma.network_nodes.create({
      data: {
        id: `node_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        type,
        code,
        name,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address,
        status,
        upstreamId,
        // Note: capacity, usedPorts, availablePorts now stored in metadata
        metadata: metadata || {},
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        userId: session.user.id,
        username: session.user.name || session.user.username,
        action: 'CREATE_NETWORK_NODE',
        description: `Created network node: ${code} (${name})`,
        module: 'NETWORK',
        status: 'success',
        metadata: JSON.stringify({ nodeId: node.id, type, code }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Network node created successfully',
      data: node,
    });
  } catch (error: any) {
    console.error('[Network Nodes API] Create error:', error);
    return NextResponse.json(
      { error: 'Failed to create network node', details: error.message },
      { status: 500 }
    );
  }
}
