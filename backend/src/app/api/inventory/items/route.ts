import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// GET - Get all items with filters
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const supplierId = searchParams.get('supplierId');
    const search = searchParams.get('search');
    const lowStock = searchParams.get('lowStock') === 'true';

    const where: any = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (supplierId) {
      where.supplierId = supplierId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (lowStock) {
      where.AND = [
        { currentStock: { lte: prisma.inventoryItem.fields.minimumStock } },
      ];
    }

    const items = await prisma.inventoryItem.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Calculate stock status
    const itemsWithStatus = items.map((item) => ({
      ...item,
      stockStatus:
        item.currentStock === 0
          ? 'out_of_stock'
          : item.currentStock <= item.minimumStock
          ? 'low_stock'
          : 'in_stock',
    }));

    return NextResponse.json(itemsWithStatus);
  } catch (error) {
    console.error('Error fetching items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch items' },
      { status: 500 }
    );
  }
}

// POST - Create item
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      sku,
      name,
      description,
      categoryId,
      supplierId,
      unit,
      minimumStock,
      currentStock,
      purchasePrice,
      sellingPrice,
      location,
      notes,
      isActive,
    } = body;

    if (!sku || !name) {
      return NextResponse.json(
        { error: 'SKU and name are required' },
        { status: 400 }
      );
    }

    const item = await prisma.inventoryItem.create({
      data: {
        sku,
        name,
        description,
        categoryId: categoryId || null,
        supplierId: supplierId || null,
        unit: unit || 'pcs',
        minimumStock: minimumStock || 0,
        currentStock: currentStock || 0,
        purchasePrice: purchasePrice || 0,
        sellingPrice: sellingPrice || 0,
        location,
        notes,
        isActive: isActive !== undefined ? isActive : true,
      },
      include: {
        category: true,
        supplier: true,
      },
    });

    // Create initial stock movement if currentStock > 0
    if (currentStock > 0) {
      await prisma.inventoryMovement.create({
        data: {
          itemId: item.id,
          movementType: 'IN',
          quantity: currentStock,
          previousStock: 0,
          newStock: currentStock,
          notes: 'Initial stock',
          userId: session.user.id,
          userName: session.user.name || session.user.username,
        },
      });
    }

    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    console.error('Error creating item:', error);
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'SKU already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create item' },
      { status: 500 }
    );
  }
}

// PUT - Update item
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      id,
      sku,
      name,
      description,
      categoryId,
      supplierId,
      unit,
      minimumStock,
      purchasePrice,
      sellingPrice,
      location,
      notes,
      isActive,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    const item = await prisma.inventoryItem.update({
      where: { id },
      data: {
        sku,
        name,
        description,
        categoryId: categoryId || null,
        supplierId: supplierId || null,
        unit,
        minimumStock,
        purchasePrice,
        sellingPrice,
        location,
        notes,
        isActive,
      },
      include: {
        category: true,
        supplier: true,
      },
    });

    return NextResponse.json(item);
  } catch (error: any) {
    console.error('Error updating item:', error);
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'SKU already exists' },
        { status: 400 }
      );
    }
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    );
  }
}

// DELETE - Delete item
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    // Delete item and movements (cascade)
    await prisma.inventoryItem.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting item:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to delete item' },
      { status: 500 }
    );
  }
}
