import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { logActivity } from '@/server/services/activity-log.service';

// PATCH - admin cancels a pending ONT removal task
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission('customers.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { id } = await params;
    const { cancelReason } = await req.json();

    const task = await prisma.ontRemovalTask.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: 'Task tidak ditemukan' }, { status: 404 });
    }
    if (task.status !== 'PENDING') {
      return NextResponse.json({ error: 'Task sudah tidak pending' }, { status: 400 });
    }

    const updated = await prisma.ontRemovalTask.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelReason: cancelReason || null,
        cancelledBy: authCheck.userId,
        cancelledAt: new Date(),
      },
    });

    try {
      const { sendWebPushToTechnician } = await import('@/server/services/push-notification.service');
      await sendWebPushToTechnician(task.assignedTechnicianId, {
        title: '❌ Tugas Cabut ONT Dibatalkan',
        body: `Task cabut ONT untuk ${task.username} dibatalkan oleh admin.`,
        url: '/technician/ont-removal-tasks',
        tag: 'ont-task-cancelled',
      });
    } catch { /* best-effort */ }

    await logActivity({
      userId: authCheck.userId,
      username: (authCheck.session.user as any)?.username || 'Admin',
      userRole: (authCheck.session.user as any)?.role,
      action: 'CANCEL_ONT_REMOVAL_TASK',
      description: `Membatalkan task cabut ONT untuk ${task.username}`,
      module: 'ont-removal',
      status: 'success',
      request: req,
      metadata: { username: task.username, cancelReason },
    });

    return NextResponse.json({ success: true, task: updated });
  } catch (error) {
    console.error('ONT removal task cancel error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
