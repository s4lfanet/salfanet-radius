import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET /api/network/fiber-paths - List all Fiber Paths
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // active, damaged, maintenance
    const search = searchParams.get('search'); // search by name

    const whereClause: any = {};

    if (status) {
      whereClause.status = status;
    }

    if (search) {
      whereClause.name = { contains: search };
    }

    const fiberPaths = await prisma.network_fiber_paths.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      data: fiberPaths,
      count: fiberPaths.length
    });

  } catch (error: any) {
    console.error('Error fetching fiber paths:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch fiber paths'
    }, { status: 500 });
  }
}

// POST /api/network/fiber-paths - Create new Fiber Path
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      pathNodes,
      cableType,
      usedCores,
      length,
      status,
      lastVerified,
      verifiedBy,
      affectedCustomers
    } = body;

    // Validation
    if (!name || !pathNodes || !cableType) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: name, pathNodes, cableType'
      }, { status: 400 });
    }

    // Validate pathNodes structure
    if (!Array.isArray(pathNodes) || pathNodes.length < 2) {
      return NextResponse.json({
        success: false,
        error: 'pathNodes must be an array with at least 2 nodes'
      }, { status: 400 });
    }

    // Create Fiber Path
    const fiberPath = await prisma.network_fiber_paths.create({
      data: {
        id: `fp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        pathNodes,
        cableType,
        usedCores: usedCores || [],
        length: length ? parseFloat(length) : null,
        status: status || 'active',
        lastVerified: lastVerified ? new Date(lastVerified) : null,
        verifiedBy: verifiedBy || null,
        affectedCustomers: affectedCustomers ? parseInt(affectedCustomers) : 0
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Fiber Path created successfully',
      data: fiberPath
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating fiber path:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create fiber path'
    }, { status: 500 });
  }
}
