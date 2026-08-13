import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

// Helper: get userId from Bearer token
async function getCustomerUserId(request: NextRequest): Promise<string | null> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;

  const session = await prisma.customerSession.findFirst({
    where: { token, verified: true, expiresAt: { gte: new Date() } },
  });
  return session?.userId ?? null;
}

/**
 * GET /api/customer/suspend-request
 * Get current/latest suspend request for logged-in customer
 */
export async function GET(request: NextRequest) {
  const userId = await getCustomerUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const latest = await prisma.suspendRequest.findFirst({
    where: { userId },
    orderBy: { requestedAt: 'desc' },
  });

  return NextResponse.json({ success: true, data: latest });
}

/**
 * POST /api/customer/suspend-request
 * Create new suspend request
 */
export async function POST(request: NextRequest) {
  const userId = await getCustomerUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { reason, startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, message: 'startDate dan endDate wajib diisi' },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { success: false, message: 'Format tanggal tidak valid' },
        { status: 400 }
      );
    }
    if (start < now) {
      return NextResponse.json(
        { success: false, message: 'Tanggal mulai tidak boleh di masa lalu' },
        { status: 400 }
      );
    }
    if (end <= start) {
      return NextResponse.json(
        { success: false, message: 'Tanggal selesai harus setelah tanggal mulai' },
        { status: 400 }
      );
    }

    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 90) {
      return NextResponse.json(
        { success: false, message: 'Maksimum suspend 90 hari' },
        { status: 400 }
      );
    }

    // Block if there's an active PENDING or APPROVED request
    const existing = await prisma.suspendRequest.findFirst({
      where: { userId, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          message:
            existing.status === 'PENDING'
              ? 'Anda sudah memiliki permintaan suspend yang menunggu persetujuan'
              : 'Anda sudah memiliki suspend yang disetujui',
        },
        { status: 409 }
      );
    }

    const suspendReq = await prisma.suspendRequest.create({
      data: {
        userId,
        reason: reason?.trim() || null,
        startDate: start,
        endDate: end,
        status: 'PENDING',
      },
    });

    return NextResponse.json({ success: true, data: suspendReq }, { status: 201 });
  } catch (error: any) {
    console.error('Create suspend request error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/customer/suspend-request
 * Cancel a PENDING suspend request
 */
export async function DELETE(request: NextRequest) {
  const userId = await getCustomerUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, message: 'ID diperlukan' }, { status: 400 });
  }

  const req = await prisma.suspendRequest.findFirst({
    where: { id, userId },
  });
  if (!req) {
    return NextResponse.json({ success: false, message: 'Permintaan tidak ditemukan' }, { status: 404 });
  }
  if (req.status !== 'PENDING') {
    return NextResponse.json(
      { success: false, message: 'Hanya permintaan PENDING yang bisa dibatalkan' },
      { status: 400 }
    );
  }

  await prisma.suspendRequest.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });

  return NextResponse.json({ success: true, message: 'Permintaan suspend dibatalkan' });
}
