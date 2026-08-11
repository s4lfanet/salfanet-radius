import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

/**
 * PUT /api/admin/suspend-requests/[id]
 * Approve or reject a suspend request
 * Body: { action: 'APPROVE' | 'REJECT', adminNotes?: string }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action, adminNotes } = body;

  if (!['APPROVE', 'REJECT'].includes(action)) {
    return NextResponse.json({ error: 'action harus APPROVE atau REJECT' }, { status: 400 });
  }

  const req = await prisma.suspendRequest.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!req) {
    return NextResponse.json({ error: 'Permintaan tidak ditemukan' }, { status: 404 });
  }
  if (req.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Permintaan sudah diproses (${req.status})` },
      { status: 409 }
    );
  }

  const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  const now = new Date();

  // Update suspend request
  const updated = await prisma.suspendRequest.update({
    where: { id },
    data: {
      status: newStatus,
      adminNotes: adminNotes?.trim() || null,
      approvedAt: now,
      approvedBy: session.user?.name || session.user?.email || 'admin',
    },
    include: {
      user: {
        select: { id: true, name: true, username: true, customerId: true, phone: true, status: true },
      },
    },
  });

  // If APPROVE and startDate is today or in the past → immediately set user status = 'stopped'
  if (action === 'APPROVE') {
    if (req.startDate <= now) {
      await prisma.pppoeUser.update({
        where: { id: req.userId },
        data: { status: 'stopped' },
      });
    }
    // If endDate is in the future, schedule unsuspend via cron is handled by existing cron job
    // (cron checks suspendRequests APPROVED where endDate <= now → restore 'active')
  }

  return NextResponse.json({ success: true, data: updated });
}
