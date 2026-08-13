import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { runPppoeSessionSync } from '@/server/cron/additional-jobs';
import { runHotspotSync } from '@/server/cron/additional-jobs';

/**
 * POST /api/sessions/sync
 * Trigger session sync directly (in-process, no HTTP loopback).
 * Query: ?type=pppoe | hotspot | all
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get('type');
  const isHotspot = type === 'hotspot';
  const isAll = !type || type === 'all';

  try {
    const results: any = {};

    if (isAll || !isHotspot) {
      results.pppoe = await runPppoeSessionSync();
    }
    if (isAll || isHotspot) {
      results.hotspot = await runHotspotSync();
    }

    return NextResponse.json({
      success: true,
      message: `Session sync completed (${type || 'all'})`,
      result: results,
    });
  } catch (error: any) {
    console.error('[SESSIONS_SYNC] Error:', error);
    return NextResponse.json(
      { error: 'Sync failed', detail: error.message },
      { status: 500 },
    );
  }
}
