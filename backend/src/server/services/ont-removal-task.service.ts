import 'server-only';
import { prisma } from '@/server/db/client';

/** A customer can only have their ONT pulled while the service is cut off. */
export const ONT_ELIGIBLE_STATUSES = ['suspended', 'isolated'];

type TaskAssignees = { username: string; assignedTechnicianId: string | null; assignedCollectorId: string | null };

/** Tell whoever the task is assigned to (technician and/or collector). Best effort. */
export async function notifyOntTaskAssignees(
  task: TaskAssignees,
  notice: { title: string; body: string; type: string },
): Promise<void> {
  if (task.assignedTechnicianId) {
    try {
      const { sendWebPushToTechnician } = await import('@/server/services/push-notification.service');
      await sendWebPushToTechnician(task.assignedTechnicianId, {
        title: notice.title,
        body: notice.body,
        url: '/technician/ont-removal-tasks',
        tag: notice.type,
      });
    } catch { /* best-effort */ }
  }
  if (task.assignedCollectorId) {
    try {
      const { notifyCollector } = await import('@/server/services/collector-notification.service');
      await notifyCollector(task.assignedCollectorId, {
        type: notice.type,
        title: notice.title,
        message: notice.body,
        link: '/collector/ont',
      });
    } catch { /* best-effort */ }
  }
}

/**
 * Cancel pending "cabut ONT" tasks whose customer is no longer cut off:
 * they paid, an admin re-activated them, or they came back some other way.
 * Nobody should be sent to pull the ONT of a customer who is subscribed
 * again. Cheap enough to run on every list request, so it also covers the
 * paths that change a customer's status without calling the payment hook.
 */
export async function reconcileOntTasks(usernames?: string[]): Promise<number> {
  const pending = await prisma.ontRemovalTask.findMany({
    where: { status: 'PENDING', ...(usernames ? { username: { in: usernames } } : {}) },
    select: { id: true, username: true, assignedTechnicianId: true, assignedCollectorId: true },
  });
  if (pending.length === 0) return 0;

  const users = await prisma.pppoeUser.findMany({
    where: { username: { in: [...new Set(pending.map((t) => t.username))] } },
    select: { username: true, status: true },
  });
  const status = new Map(users.map((u) => [u.username, u.status]));
  // A deleted customer has nothing left to pull either.
  const stale = pending.filter((t) => !ONT_ELIGIBLE_STATUSES.includes(status.get(t.username) ?? ''));
  if (stale.length === 0) return 0;

  await prisma.ontRemovalTask.updateMany({
    where: { id: { in: stale.map((t) => t.id) }, status: 'PENDING' },
    data: {
      status: 'CANCELLED',
      cancelReason: 'Pelanggan berlangganan kembali',
      cancelledBy: 'system',
      cancelledAt: new Date(),
    },
  });
  for (const t of stale) {
    await notifyOntTaskAssignees(t, {
      type: 'ont-task-cancelled',
      title: 'Tugas Cabut ONT Dibatalkan',
      body: `Tugas cabut ONT untuk ${t.username} dibatalkan otomatis karena pelanggan berlangganan kembali.`,
    });
  }
  return stale.length;
}

/**
 * Auto-cancel any pending "cabut ONT" tasks for a customer who just paid
 * their bill — nobody should show up to disconnect someone who settled
 * their invoice in the meantime. Call this from every payment completion
 * path (collector mark-paid, online gateway webhook, etc).
 */
export async function cancelPendingOntTasksForPaidUser(username: string): Promise<void> {
  const pendingTasks = await prisma.ontRemovalTask.findMany({
    where: { username, status: 'PENDING' },
    select: { id: true, username: true, assignedTechnicianId: true, assignedCollectorId: true },
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

  for (const task of pendingTasks) {
    await notifyOntTaskAssignees(task, {
      type: 'ont-task-cancelled',
      title: 'Tugas Cabut ONT Dibatalkan',
      body: `Tugas cabut ONT untuk ${username} dibatalkan otomatis karena pelanggan melunasi tagihan.`,
    });
  }
}
