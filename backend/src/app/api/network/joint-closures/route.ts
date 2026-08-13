import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prepareJCMetadata } from '@/lib/network-sync-helpers';

// GET /api/network/joint-closures - List all Joint Closures
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // CORE, DISTRIBUTION, FEEDER
    const status = searchParams.get('status'); // active, inactive, maintenance, damaged
    const search = searchParams.get('search'); // search by name or code

    const whereClause: any = {};

    if (type) {
      whereClause.type = type;
    }

    if (status) {
      whereClause.status = status;
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { address: { contains: search } }
      ];
    }

    const jointClosures = await prisma.network_joint_closures.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      data: jointClosures,
      count: jointClosures.length
    });

  } catch (error: any) {
    console.error('Error fetching joint closures:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch joint closures'
    }, { status: 500 });
  }
}

// POST /api/network/joint-closures - Create new Joint Closure
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
      type,
      latitude,
      longitude,
      address,
      cableType,
      fiberCount,
      connections,
      hasSplitter,
      splitterRatio,
      status,
      installDate,
      lastInspection,
      followRoad,
      customRouteWaypoints,
      spliceTrayCount,
      totalSpliceCapacity,
      closureType,
    } = body;

    // Validation
    if (!name || !code || !type || !latitude || !longitude || !cableType || !fiberCount) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: name, code, type, latitude, longitude, cableType, fiberCount'
      }, { status: 400 });
    }

    // Check if code already exists
    const existing = await prisma.network_joint_closures.findUnique({
      where: { code }
    });

    if (existing) {
      return NextResponse.json({
        success: false,
        error: `Joint Closure with code '${code}' already exists`
      }, { status: 409 });
    }

    // Create Joint Closure
    const jointClosure = await prisma.network_joint_closures.create({
      data: {
        id: `jc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        code,
        type,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address: address || null,
        cableType,
        fiberCount: parseInt(fiberCount),
        connections: connections || [],
        hasSplitter: hasSplitter || false,
        splitterRatio: splitterRatio || null,
        status: status || 'active',
        installDate: installDate ? new Date(installDate) : null,
        lastInspection: lastInspection ? new Date(lastInspection) : null,
        followRoad: followRoad !== undefined ? followRoad : true,
        customRouteWaypoints: customRouteWaypoints || null,
        spliceTrayCount: spliceTrayCount ? parseInt(spliceTrayCount) : 4,
        totalSpliceCapacity: totalSpliceCapacity ? parseInt(totalSpliceCapacity) : 96,
        closureType: closureType || 'BRANCHING',
      }
    });

    // 🔄 AUTO-SYNC to network_nodes (Unified Map)
    try {
      await prisma.network_nodes.upsert({
        where: { id: jointClosure.id },
        create: {
          id: jointClosure.id,
          type: 'JOINT_CLOSURE',
          code: jointClosure.code,
          name: jointClosure.name,
          latitude: jointClosure.latitude,
          longitude: jointClosure.longitude,
          address: jointClosure.address,
          status: jointClosure.status as 'active' | 'inactive' | 'maintenance' | 'damaged',
          upstreamId: null, // JC biasanya connect ke OLT, bisa di-set manual
          metadata: prepareJCMetadata(jointClosure),
        },
        update: {
          code: jointClosure.code,
          name: jointClosure.name,
          latitude: jointClosure.latitude,
          longitude: jointClosure.longitude,
          address: jointClosure.address,
          status: jointClosure.status as 'active' | 'inactive' | 'maintenance' | 'damaged',
          metadata: prepareJCMetadata(jointClosure),
        }
      });
      console.log(`✅ Joint Closure ${jointClosure.code} synced to network_nodes`);
    } catch (syncError: any) {
      console.error('⚠️ Failed to sync to network_nodes:', syncError.message);
      // Tidak throw error, biarkan JC tetap ter-create
    }

    return NextResponse.json({
      success: true,
      message: 'Joint Closure created successfully',
      data: jointClosure
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating joint closure:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create joint closure'
    }, { status: 500 });
  }
}
