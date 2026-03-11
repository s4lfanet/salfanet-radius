import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET /api/network/fiber-paths/:id - Get Fiber Path detail
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
    const fiberPath = await prisma.network_fiber_paths.findUnique({
      where: { id }
    });

    if (!fiberPath) {
      return NextResponse.json({
        success: false,
        error: 'Fiber Path not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: fiberPath
    });

  } catch (error: any) {
    console.error('Error fetching fiber path:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch fiber path'
    }, { status: 500 });
  }
}

// PUT /api/network/fiber-paths/:id - Update Fiber Path
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

    // Check if exists
    const existing = await prisma.network_fiber_paths.findUnique({
      where: { id }
    });

    if (!existing) {
      return NextResponse.json({
        success: false,
        error: 'Fiber Path not found'
      }, { status: 404 });
    }

    // Update Fiber Path
    const updated = await prisma.network_fiber_paths.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(pathNodes && { pathNodes }),
        ...(cableType && { cableType }),
        ...(usedCores !== undefined && { usedCores }),
        ...(length !== undefined && { length: length ? parseFloat(length) : null }),
        ...(status && { status }),
        ...(lastVerified !== undefined && { lastVerified: lastVerified ? new Date(lastVerified) : null }),
        ...(verifiedBy !== undefined && { verifiedBy }),
        ...(affectedCustomers !== undefined && { affectedCustomers: parseInt(affectedCustomers) })
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Fiber Path updated successfully',
      data: updated
    });

  } catch (error: any) {
    console.error('Error updating fiber path:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update fiber path'
    }, { status: 500 });
  }
}

// DELETE /api/network/fiber-paths/:id - Delete Fiber Path
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
    // Check if exists
    const existing = await prisma.network_fiber_paths.findUnique({
      where: { id }
    });

    if (!existing) {
      return NextResponse.json({
        success: false,
        error: 'Fiber Path not found'
      }, { status: 404 });
    }

    // Delete Fiber Path
    await prisma.network_fiber_paths.delete({
      where: { id }
    });

    return NextResponse.json({
      success: true,
      message: 'Fiber Path deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting fiber path:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to delete fiber path'
    }, { status: 500 });
  }
}
