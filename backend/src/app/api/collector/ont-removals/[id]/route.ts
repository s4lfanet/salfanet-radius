import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';
import { reconcileOntTasks } from '@/server/services/ont-removal-task.service';

/**
 * PATCH - the collector reports on a task an admin assigned to them:
 *   { action: 'complete', notes? }  the ONT was pulled
 *   { action: 'cancel', notes }     could not be done (reason required)
 * If a technician shares the task, whoever finishes first closes it.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const collector = await verifyCollector(req);
  if (!collector) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const { action, notes } = (await req.json()) as { action?: string; notes?: string };
    if (action !== 'complete' && action !== 'cancel') {
      return NextResponse.json({ error: 'action harus complete atau cancel' }, { status: 400 });
    }
    const text = typeof notes === 'string' ? notes.trim() : '';
    if (action === 'cancel' && !text) {
      return NextResponse.json({ error: 'Alasan wajib diisi jika tugas tidak bisa dikerjakan' }, { status: 400 });
    }

    const task = await prisma.ontRemovalTask.findUnique({ where: { id } });
    if (!task) return NextResponse.json({ error: 'Task tidak ditemukan' }, { status: 404 });
    if (task.assignedCollectorId !== collector.id) {
      return NextResponse.json({ error: 'Anda tidak ditugaskan pada task ini' }, { status: 403 });
    }

    // The customer may have paid or been re-activated since the task was made.
    await reconcileOntTasks([task.username]);
    const current = await prisma.ontRemovalTask.findUnique({ where: { id } });
    if (!current || current.status !== 'PENDING') {
      return NextResponse.json(
        { error: current?.status === 'CANCELLED' ? `Tugas sudah dibatalkan${current.cancelReason ? `: ${current.cancelReason}` : ''}` : 'Task sudah tidak pending' },
        { status: 400 },
      );
    }

    // Only while still pending, so a technician finishing at the same moment wins cleanly.
    const claimed = await prisma.ontRemovalTask.updateMany({
      where: { id, status: 'PENDING' },
      data:
        action === 'complete'
          ? { status: 'COMPLETED', completedAt: new Date(), completedNotes: text || null, completedById: collector.id, completedByRole: 'collector' }
          : { status: 'CANCELLED', cancelledBy: collector.id, cancelledAt: new Date(), cancelReason: text },
    });

    if (claimed.count === 0) {
      return NextResponse.json({ error: 'Task sudah diselesaikan atau dibatalkan oleh pihak lain' }, { status: 409 });
    }
    const updated = await prisma.ontRemovalTask.findUnique({ where: { id } });
    return NextResponse.json({ success: true, task: updated });
  } catch (error) {
    console.error('Collector ONT removal task update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
