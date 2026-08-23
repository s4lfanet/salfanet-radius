import 'server-only';
import { prisma } from '@/server/db/client';

/**
 * Auto-cancel any pending "cabut ONT" tasks for a customer who just paid
 * their bill — a technician shouldn't show up to disconnect someone who
 * settled their invoice in the meantime. Call this from every payment
 * completion path (collector mark-paid, online gateway webhook, etc).
 */
export async function cancelPendingOntTasksForPaidUser(username: string): Promise<void> {
  const pendingTasks = await prisma.ontRemovalTask.findMany({
    where: { username, status: 'PENDING' },
    select: { id: true, assignedTechnicianId: true },
  });

  if (pendingTasks.length === 0) return;

  await prisma.ontRemovalTask.updateMany({
    where: { username, status: 'PENDING' },
    data: {
      status: 'CANCELLED',
      cancelReason: 'Pelanggan melunasi tagihan',
      cancelledBy: 'system',
      cancelledAt: new Date(),
    },
  });

  try {
    const { sendWebPushToTechnician } = await import('@/server/services/push-notification.service');
    for (const task of pendingTasks) {
      await sendWebPushToTechnician(task.assignedTechnicianId, {
        title: '❌ Tugas Cabut ONT Dibatalkan',
        body: `Task cabut ONT untuk ${username} dibatalkan otomatis karena pelanggan melunasi tagihan.`,
        url: '/technician/ont-removal-tasks',
        tag: 'ont-task-cancelled',
      }).catch(() => {});
    }
  } catch { /* best-effort */ }
}
