import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET /api/network/nodes/:id - Get single node with details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const node = await prisma.network_nodes.findUnique({
      where: { id },
    });

    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Get downstream nodes (connected nodes)
    const downstreamNodes = await prisma.network_nodes.findMany({
      where: { upstreamId: id },
      select: {
        id: true,
        type: true,
        code: true,
        name: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...node,
        downstreamNodes,
      },
    });
  } catch (error: any) {
    console.error('[Network Node API] Get error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch network node', details: error.message },
      { status: 500 }
    );
  }
}

// PUT /api/network/nodes/:id - Update node
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      code,
      name,
      latitude,
      longitude,
      address,
      status,
      upstreamId,
      capacity,
      usedPorts,
      metadata,
    } = body;

    // Check if node exists
    const existing = await prisma.network_nodes.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Note: capacity, usedPorts, availablePorts should be stored in metadata JSON
    // Calculate from metadata if needed

    // Update node
    const updated = await prisma.network_nodes.update({
      where: { id },
      data: {
        ...(code && { code }),
        ...(name && { name }),
        ...(latitude && { latitude: parseFloat(latitude) }),
        ...(longitude && { longitude: parseFloat(longitude) }),
        ...(address !== undefined && { address }),
        ...(status && { status }),
        ...(upstreamId !== undefined && { upstreamId }),
        // Note: capacity, usedPorts, availablePorts should be stored in metadata
        ...(metadata && { metadata }),
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        userId: session.user.id,
        username: session.user.name || session.user.username,
        action: 'UPDATE_NETWORK_NODE',
        description: `Updated network node: ${updated.code}`,
        module: 'NETWORK',
        status: 'success',
        metadata: JSON.stringify({ nodeId: id, changes: Object.keys(body) }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Network node updated successfully',
      data: updated,
    });
  } catch (error: any) {
    console.error('[Network Node API] Update error:', error);
    return NextResponse.json(
      { error: 'Failed to update network node', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/network/nodes/:id - Delete node
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    // Check if node exists
    const existing = await prisma.network_nodes.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Check for downstream dependencies
    const hasDownstream = await prisma.network_nodes.count({
      where: { upstreamId: id },
    });

    if (hasDownstream > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete node: ${hasDownstream} downstream nodes depend on it`,
        },
        { status: 409 }
      );
    }

    // Delete node
    await prisma.network_nodes.delete({
      where: { id },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        userId: session.user.id,
        username: session.user.name || session.user.username,
        action: 'DELETE_NETWORK_NODE',
        description: `Deleted network node: ${existing.code}`,
        module: 'NETWORK',
        status: 'success',
        metadata: JSON.stringify({ nodeId: id, type: existing.type }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Network node deleted successfully',
    });
  } catch (error: any) {
    console.error('[Network Node API] Delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete network node', details: error.message },
      { status: 500 }
    );
  }
}
