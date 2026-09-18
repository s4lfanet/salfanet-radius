import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';

// GET - List all banners (admin)
export async function GET() {
  try {
    const authCheck = await requirePermission('settings.company');
    if (!authCheck.authorized) return authCheck.response;

    const banners = await prisma.promoBanner.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, banners });
  } catch (error: any) {
    console.error('Error fetching promo banners:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch promo banners' },
      { status: 500 }
    );
  }
}

// POST - Create banner
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.company');
    if (!authCheck.authorized) return authCheck.response;

    const body = await req.json();
    const { imageUrl, linkUrl, title, order, isActive } = body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'imageUrl is required' },
        { status: 400 }
      );
    }

    const banner = await prisma.promoBanner.create({
      data: {
        imageUrl,
        linkUrl: linkUrl || null,
        title: title || null,
        order: typeof order === 'number' ? order : 0,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json({ success: true, banner });
  } catch (error: any) {
    console.error('Error creating promo banner:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create promo banner' },
      { status: 500 }
    );
  }
}

// PUT - Update banner
export async function PUT(req: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.company');
    if (!authCheck.authorized) return authCheck.response;

    const body = await req.json();
    const { id, imageUrl, linkUrl, title, order, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Banner ID is required' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (linkUrl !== undefined) updateData.linkUrl = linkUrl || null;
    if (title !== undefined) updateData.title = title || null;
    if (order !== undefined) updateData.order = order;
    if (isActive !== undefined) updateData.isActive = isActive;

    const banner = await prisma.promoBanner.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, banner });
  } catch (error: any) {
    console.error('Error updating promo banner:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Banner not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update promo banner' },
      { status: 500 }
    );
  }
}

// DELETE - Delete banner
export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.company');
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Banner ID is required' },
        { status: 400 }
      );
    }

    await prisma.promoBanner.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Banner deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting promo banner:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Banner not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to delete promo banner' },
      { status: 500 }
    );
  }
}
