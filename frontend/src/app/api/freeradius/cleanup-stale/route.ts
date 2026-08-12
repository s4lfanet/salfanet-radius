import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

/**
 * POST /api/freeradius/cleanup-stale
 * Close stale radacct sessions: acctstoptime IS NULL + no traffic + no session time + start > 10min ago.
 * These are sessions where user authenticated but never sent interim update or Accounting-Stop
 * (e.g. duplicate packet caused auth but session never established, or NAS rebooted).
 */
export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // Close stale sessions
        const result = await prisma.$executeRaw`
            UPDATE radacct
            SET acctstoptime = NOW(),
                acctterminatecause = 'Stale-Session-Cleanup'
            WHERE acctstoptime IS NULL
              AND (acctsessiontime = 0 OR acctsessiontime IS NULL)
              AND (acctinputoctets = 0 OR acctinputoctets IS NULL)
              AND (acctoutputoctets = 0 OR acctoutputoctets IS NULL)
              AND acctstarttime < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
        `;

        // Also close very old sessions (>7 days with no update) regardless of traffic
        // (NAS may have rebooted and lost session state)
        const result2 = await prisma.$executeRaw`
            UPDATE radacct
            SET acctstoptime = NOW(),
                acctterminatecause = 'NAS-Reboot-Cleanup'
            WHERE acctstoptime IS NULL
              AND acctupdatetime < DATE_SUB(NOW(), INTERVAL 7 DAY)
        `;

        const cleaned = Number(result) + Number(result2);

        return NextResponse.json({
            success: true,
            message: `Cleanup selesai: ${cleaned} stale session ditutup`,
            cleanedStale: Number(result),
            cleanedOld: Number(result2),
            total: cleaned,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Cleanup failed' }, { status: 500 });
    }
}
