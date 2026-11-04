import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { notifyAdmins, pushToCustomer } from '@/server/services/notifications/event-notices.service';

/**
 * PUT /api/admin/suspend-requests/[id]
 * Approve or reject a suspend request
 * Body: { action: 'APPROVE' | 'REJECT', adminNotes?: string }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission('customers.isolate');
  if (!authCheck.authorized) return authCheck.response;

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
      approvedBy: authCheck.session.user?.name || authCheck.session.user?.email || 'admin',
    },
    include: {
      user: {
        select: { id: true, name: true, username: true, customerId: true, phone: true, status: true },
      },
    },
  });

  // If APPROVE and the suspend has already started, apply it now through
  // the suspend check (DB status 'isolated' + RADIUS + MikroTik). This used
  // to write status 'stopped', which is not a status the rest of the app
  // knows; the hourly job then turned it into 'isolated' and the request
  // was never ended. Ending + restore is handled by runSuspendCheck too.
  if (action === 'APPROVE' && req.startDate <= now) {
    try {
      const { runSuspendCheck } = await import('@/server/cron/invoice-jobs');
      await runSuspendCheck();
    } catch (e: any) {
      console.error('[SuspendRequest] Immediate suspend apply failed (cron will retry):', e?.message || e);
    }
  }

  await pushToCustomer(
    req.userId,
    action === 'APPROVE' ? 'Permintaan Suspend Disetujui' : 'Permintaan Suspend Ditolak',
    action === 'APPROVE'
      ? 'Permintaan cuti langganan Anda disetujui.'
      : `Permintaan cuti langganan Anda ditolak${adminNotes?.trim() ? `: ${adminNotes.trim().slice(0, 100)}` : '.'}`,
  );

  return NextResponse.json({ success: true, data: updated });
}
