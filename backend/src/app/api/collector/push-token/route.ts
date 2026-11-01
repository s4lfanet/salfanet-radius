import { NextRequest, NextResponse } from 'next/server';
import { verifyCollector } from '@/server/auth/collector-auth';
import { registerCollectorPushToken, removeCollectorPushToken } from '@/server/services/fcm-push.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/collector/push-token  — register the collector Flutter app's FCM token
 * DELETE /api/collector/push-token?token=...  — unregister (on logout)
 */
export async function POST(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { token, platform } = (await req.json()) as { token?: string; platform?: string };
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, error: 'token is required' }, { status: 400 });
    }
    await registerCollectorPushToken(collector.id, token, platform || 'android');
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[Collector push-token] register error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const token = new URL(req.url).searchParams.get('token');
    const removed = await removeCollectorPushToken(collector.id, token);
    return NextResponse.json({ success: true, removed });
  } catch (error: unknown) {
    console.error('[Collector push-token] remove error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
