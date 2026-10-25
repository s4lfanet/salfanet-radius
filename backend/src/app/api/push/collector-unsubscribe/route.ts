import { NextRequest, NextResponse } from 'next/server';
import { verifyCollector } from '@/server/auth/collector-auth';
import { removeCollectorPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: NextRequest) {
  const collector = await verifyCollector(request);
  if (!collector) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { endpoint } = await request.json().catch(() => ({ endpoint: null }));
    const removed = await removeCollectorPushSubscription(collector.id, endpoint);
    return NextResponse.json({ success: true, removed });
  } catch (error) {
    console.error('[Collector Push Unsubscribe] Error:', error);
    return NextResponse.json({ success: false, error: 'Gagal menghapus langganan push' }, { status: 500 });
  }
}
