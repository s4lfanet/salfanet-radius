import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET - Get movements for an item or all movements
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');
    const movementType = searchParams.get('movementType');
    const limit = parseInt(searchParams.get('limit') || '100');

    const where: any = {};

    if (itemId) {
      where.itemId = itemId;
    }

    if (movementType) {
      where.movementType = movementType;
    }

    const movements = await prisma.inventoryMovement.findMany({
      where,
      include: {
        item: {
          select: {
            id: true,
            sku: true,
            name: true,
            unit: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json(movements);
  } catch (error) {
    console.error('Error fetching movements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch movements' },
      { status: 500 }
    );
  }
}

// POST - Create movement (stock in/out/adjustment)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { itemId, movementType, quantity, referenceNo, notes } = body;

    if (!itemId || !movementType || !quantity) {
      return NextResponse.json(
        { error: 'ItemId, movementType, and quantity are required' },
        { status: 400 }
      );
    }

    if (!['IN', 'OUT', 'ADJUSTMENT'].includes(movementType)) {
      return NextResponse.json(
        { error: 'Invalid movement type. Must be IN, OUT, or ADJUSTMENT' },
        { status: 400 }
      );
    }

    // Get current item
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const previousStock = item.currentStock;
    let newStock = previousStock;

    // Calculate new stock
    if (movementType === 'IN') {
      newStock = previousStock + quantity;
    } else if (movementType === 'OUT') {
      if (previousStock < quantity) {
        return NextResponse.json(
          { error: 'Insufficient stock' },
          { status: 400 }
        );
      }
      newStock = previousStock - quantity;
    } else if (movementType === 'ADJUSTMENT') {
      // For adjustment, quantity is the new stock value
      newStock = quantity;
    }

    // Create movement and update item stock in a transaction
    const [movement] = await prisma.$transaction([
      prisma.inventoryMovement.create({
        data: {
          itemId,
          movementType,
          quantity: movementType === 'ADJUSTMENT' ? newStock - previousStock : quantity,
          previousStock,
          newStock,
          referenceNo,
          notes,
          userId: session.user.id,
          userName: session.user.name || session.user.username,
        },
        include: {
          item: {
            select: {
              id: true,
              sku: true,
              name: true,
              unit: true,
            },
          },
        },
      }),
      prisma.inventoryItem.update({
        where: { id: itemId },
        data: { currentStock: newStock },
      }),
    ]);

    return NextResponse.json(movement, { status: 201 });
  } catch (error) {
    console.error('Error creating movement:', error);
    return NextResponse.json(
      { error: 'Failed to create movement' },
      { status: 500 }
    );
  }
}

// DELETE - Delete movement (admin only, careful!)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Movement ID is required' },
        { status: 400 }
      );
    }

    // Get movement to reverse the stock
    const movement = await prisma.inventoryMovement.findUnique({
      where: { id },
      include: { item: true },
    });

    if (!movement) {
      return NextResponse.json(
        { error: 'Movement not found' },
        { status: 404 }
      );
    }

    // Reverse the stock change
    const reversedStock = movement.previousStock;

    await prisma.$transaction([
      prisma.inventoryMovement.delete({
        where: { id },
      }),
      prisma.inventoryItem.update({
        where: { id: movement.itemId },
        data: { currentStock: reversedStock },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting movement:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Movement not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to delete movement' },
      { status: 500 }
    );
  }
}
