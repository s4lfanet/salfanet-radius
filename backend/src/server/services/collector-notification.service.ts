import { prisma } from '@/server/db/client';

export interface CollectorNotice {
  type: string;
  title: string;
  message: string;
  /** Where tapping it goes, inside the collector portal. */
  link?: string;
}

export const fmtRupiah = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

/**
 * Tell a collector something: a row for the bell, and a web push to their
 * browsers. Best effort on both: the thing that happened (a confirmation, a
 * review) must never fail because a notification could not be written or a
 * push service was unreachable.
 */
export async function notifyCollector(collectorId: string, notice: CollectorNotice): Promise<void> {
  try {
    await prisma.collectorNotification.create({
      data: {
        collectorId,
        type: notice.type.slice(0, 40),
        title: notice.title.slice(0, 160),
        message: notice.message.slice(0, 500),
        link: notice.link?.slice(0, 200) || null,
      },
    });
  } catch (error) {
    console.error('[CollectorNotify] Could not store notification:', error instanceof Error ? error.message : error);
    return;
  }

  try {
    const { sendWebPushToCollector } = await import('@/server/services/push-notification.service');
    await sendWebPushToCollector(collectorId, {
      title: notice.title,
      body: notice.message,
      url: notice.link || '/collector/dashboard',
      // Same type replaces the earlier banner instead of stacking up.
      tag: `collector-${notice.type}`,
    });
  } catch (error) {
    console.error('[CollectorNotify] Push failed:', error instanceof Error ? error.message : error);
  }
}

/** One notification per collector for a batch of payments, e.g. a confirmation of 12 payments. */
export async function notifyCollectorsOfPayments(
  rows: Array<{ paidById: string | null; amount: number }>,
  build: (count: number, amount: number) => CollectorNotice,
): Promise<void> {
  const byCollector = new Map<string, { count: number; amount: number }>();
  for (const r of rows) {
    if (!r.paidById) continue;
    const cur = byCollector.get(r.paidById) || { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += r.amount;
    byCollector.set(r.paidById, cur);
  }
  await Promise.all([...byCollector].map(([id, t]) => notifyCollector(id, build(t.count, t.amount))));
}
