import { NextRequest, NextResponse } from 'next/server';
import { verifyCollector } from '@/server/auth/collector-auth';
import { upsertCollectorPushSubscription } from '@/server/services/push-notification.service';

// The collector portal signs in with its own cookie, not the admin session,
// so it has its own subscribe route.
export async function POST(request: NextRequest) {
  const collector = await verifyCollector(request);
  if (!collector) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { subscription } = await request.json();
    if (!subscription) {
      return NextResponse.json({ success: false, error: 'subscription is required' }, { status: 400 });
    }
    const saved = await upsertCollectorPushSubscription(collector.id, subscription, request.headers.get('user-agent'));
    return NextResponse.json({ success: true, subscriptionId: saved.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menyimpan langganan push';
    return NextResponse.json({ success: false, error: message }, { status: message.startsWith('Invalid') ? 400 : 500 });
  }
}
