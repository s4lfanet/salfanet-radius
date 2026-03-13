import { prisma } from '@/server/db/client';
import { nanoid } from 'nanoid';

export async function saveCronHistory(data: {
  jobType: string;
  status: 'running' | 'success' | 'error';
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  result?: string;
  error?: string;
}) {
  try {
    await prisma.cronHistory.create({
      data: {
        id: nanoid(),
        ...data,
      },
    });
  } catch (error) {
    console.error('Failed to save cron history:', error);
  }
}

// Cleanup old history — keep last 50 per job type + delete anything older than 30 days
export async function cleanupOldHistory() {
  try {
    // 1. Delete all entries older than 30 days in one query
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.cronHistory.deleteMany({ where: { startedAt: { lt: cutoff } } });

    // 2. Per job-type: keep only last 50
    const jobTypes = await prisma.cronHistory.groupBy({
      by: ['jobType'],
    });

    for (const { jobType } of jobTypes) {
      const rows = await prisma.cronHistory.findMany({
        where: { jobType },
        orderBy: { startedAt: 'desc' },
        skip: 50,
        select: { id: true },
      });
      if (rows.length > 0) {
        await prisma.cronHistory.deleteMany({ where: { id: { in: rows.map(r => r.id) } } });
      }
    }
  } catch (error) {
    console.error('Failed to cleanup old history:', error);
  }
}
