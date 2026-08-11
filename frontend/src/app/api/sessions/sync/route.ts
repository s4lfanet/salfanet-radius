import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { syncPPPoESessions } from '@/server/jobs/pppoe-session-sync';
import { syncHotspotWithRadius } from '@/server/jobs/hotspot-sync';

/**
 * POST /api/sessions/sync
 *
 * Triggers the full session sync job on demand.
 * - type=pppoe  → syncPPPoESessions() (close stale >30min, blocked, orphan)
 * - type=hotspot → syncHotspotWithRadius() (activate WAITING, expire EXPIRED, disconnect expired)
 * - type not set → run both
 *
 * This is the same logic as the cron jobs but triggered manually by the UI
 * (e.g. the "sinkron ulang" button on session pages).
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get('type'); // 'pppoe' | 'hotspot' | null

  try {
    const results: Record<string, any> = {};

    if (!type || type === 'pppoe') {
      const pppoeResult = await syncPPPoESessions();
      results.pppoe = pppoeResult;
    }

    if (!type || type === 'hotspot') {
      const hotspotResult = await syncHotspotWithRadius();
      results.hotspot = hotspotResult;
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('[Sessions Sync API] Error:', error.message);
    return NextResponse.json(
      { error: 'Sync failed', detail: error.message },
      { status: 500 },
    );
  }
}
