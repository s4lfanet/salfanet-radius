import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/addon-types
 * List all addon types ordered by name ASC.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const addons = await prisma.addonType.findMany({
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ addons });
  } catch (error: any) {
    console.error('[AddonTypes GET] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/addon-types
 * Create a new addon type.
 * Body: { name, description?, price, isRecurring? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as any)?.role !== 'ADMIN' && (session.user as any)?.role !== 'SUPER_ADMIN' && (session.user as any)?.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, price, isRecurring } = body as {
      name?: string;
      description?: string;
      price?: number;
      isRecurring?: boolean;
    };

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (price === undefined || price === null || typeof price !== 'number' || price < 0) {
      return NextResponse.json({ error: 'price is required and must be a non-negative number' }, { status: 400 });
    }

    const addon = await prisma.addonType.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        price,
        isRecurring: isRecurring ?? true,
        isActive: true,
      },
    });

    return NextResponse.json({ addon }, { status: 201 });
  } catch (error: any) {
    console.error('[AddonTypes POST] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
