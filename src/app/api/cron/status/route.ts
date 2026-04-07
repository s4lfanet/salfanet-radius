import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { CRON_JOBS, getNextRunTime } from '@/server/jobs/jobs.config';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { unauthorized } from '@/lib/api-response';
import { nowWIB } from '@/lib/timezone';

// Cron timestamps are stored with new Date() (real UTC epoch).
// formatWIB reads UTC-as-WIB, so they appear 7h behind WIB.
// Shift +7h here so formatWIB displays the correct WIB time.
const toWIBDisplay = (d: Date | null | undefined): Date | null =>
  d ? new Date(d.getTime() + 7 * 3600000) : null;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

    // Compute current WIB time once for nextRun calculations
    const currentWIB = nowWIB();

    // Get latest run for each job type
    const jobsStatus = await Promise.all(
      CRON_JOBS.map(async (job) => {
        // Get last 5 runs
        const history = await prisma.cronHistory.findMany({
          where: { jobType: job.type },
          orderBy: { startedAt: 'desc' },
          take: 5,
        });

        const lastRun = history[0];
        const lastSuccess = history.find((h) => h.status === 'success');
        
        // Calculate health status
        const recentRuns = history.slice(0, 3);
        const failureCount = recentRuns.filter((h) => h.status === 'error').length;
        const health = failureCount >= 2 ? 'unhealthy' : failureCount === 1 ? 'degraded' : 'healthy';

        // Calculate next run from current WIB time (getNextRunTime uses UTC methods)
        const nextRun = getNextRunTime(job.schedule, currentWIB);

        return {
          ...job,
          lastRun: lastRun ? {
            startedAt: toWIBDisplay(lastRun.startedAt),
            completedAt: toWIBDisplay(lastRun.completedAt),
            status: lastRun.status,
            duration: lastRun.duration,
            result: lastRun.result,
            error: lastRun.error,
          } : null,
          lastSuccessAt: toWIBDisplay(lastSuccess?.startedAt),
          nextRun,
          health,
          recentHistory: history.slice(0, 10).map(h => ({
            ...h,
            startedAt: toWIBDisplay(h.startedAt),
            completedAt: toWIBDisplay(h.completedAt),
          })),
        };
      })
    );

    return NextResponse.json({
      success: true,
      jobs: jobsStatus,
    });
  } catch (error) {
    console.error('Get cron status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get cron status' },
      { status: 500 }
    );
  }
}
