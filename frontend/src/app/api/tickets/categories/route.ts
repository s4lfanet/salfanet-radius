import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { verifyAgentToken } from '@/server/auth/agent-jwt';

// GET - List all categories
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Allow customer Bearer token or Agent JWT as fallback
    if (!session) {
      const bearerToken = req.headers.get('authorization')?.replace('Bearer ', '');
      if (bearerToken) {
        // Try agent JWT first
        const agentPayload = await verifyAgentToken(bearerToken);
        if (agentPayload) {
          // Valid agent token — allow access
        } else {
          // Try customer session token
          const customerSession = await prisma.customerSession.findFirst({
            where: { token: bearerToken, verified: true, expiresAt: { gte: new Date() } },
            select: { userId: true },
          });
          if (!customerSession) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }
        }
      } else {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    const { searchParams } = new URL(req.url);
    const isActiveParam = searchParams.get('isActive');

    const where: any = {};

    if (isActiveParam !== null) {
      where.isActive = isActiveParam === 'true';
    }

    // Check if prisma client has ticketCategory model
    if (!prisma.ticketCategory) {
      console.error('Prisma ticketCategory model not found');
      return NextResponse.json([], { status: 200 }); // Return empty array instead of error
    }

    const categories = await prisma.ticketCategory.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { tickets: true },
        },
      },
    });

    return NextResponse.json(categories);
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    // If table doesn't exist, return empty array
    if (error.code === 'P2021' || error.message?.includes('does not exist') || error.message?.includes('ticketCategory')) {
      console.log('Table does not exist, returning empty array');
      return NextResponse.json([], { status: 200 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch categories', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Create category
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, color, isActive } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    // Check if name already exists
    const existing = await prisma.ticketCategory.findUnique({
      where: { name },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Category with this name already exists' },
        { status: 409 }
      );
    }

    const category = await prisma.ticketCategory.create({
      data: {
        id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name,
        description: description || null,
        color: color || '#3B82F6',
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    return NextResponse.json(
      { error: 'Failed to create category' },
      { status: 500 }
    );
  }
}

// PUT - Update category
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, description, color, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      );
    }

    // Check if prisma client has ticketCategory model
    if (!prisma.ticketCategory) {
      console.error('Prisma ticketCategory model not found');
      return NextResponse.json(
        { error: 'Database table not available. Please run database migrations.' },
        { status: 503 }
      );
    }

    // Check if category exists in database
    const existingCategory = await prisma.ticketCategory.findUnique({
      where: { id },
    }).catch(() => null);

    // If category doesn't exist, create it instead of update
    if (!existingCategory) {
      console.log('Category not found in DB, creating new one');
      const category = await prisma.ticketCategory.create({
        data: {
          id,
          name,
          description: description || null,
          color: color || '#3B82F6',
          isActive: isActive !== undefined ? isActive : true,
        },
      });
      return NextResponse.json(category);
    }

    // Check if new name conflicts with existing
    if (name && name !== existingCategory.name) {
      const existing = await prisma.ticketCategory.findFirst({
        where: {
          name,
          id: { not: id },
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: 'Category with this name already exists' },
          { status: 409 }
        );
      }
    }

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (color !== undefined) updateData.color = color;
    if (isActive !== undefined) updateData.isActive = isActive;

    const category = await prisma.ticketCategory.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(category);
  } catch (error: any) {
    console.error('Error updating category:', error);
    // If table doesn't exist, return helpful error
    if (error.code === 'P2021' || error.message?.includes('does not exist')) {
      return NextResponse.json(
        { error: 'Database table not available. Please run database migrations.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update category', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete category
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      );
    }

    // Check if category has tickets
    const ticketCount = await prisma.ticket.count({
      where: { categoryId: id },
    });

    if (ticketCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete category with ${ticketCount} tickets. Reassign tickets first.` },
        { status: 400 }
      );
    }

    await prisma.ticketCategory.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}
