import { NextResponse } from 'next/server';
import { getCustomerSessionFromRequest } from '@/server/auth/customer-session';
import { upsertWebPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: Request) {
  try {
    const session = await getCustomerSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const subscription = body.subscription;

    if (!subscription) {
      return NextResponse.json({ success: false, error: 'Subscription is required' }, { status: 400 });
    }

    const saved = await upsertWebPushSubscription(session.userId, subscription, request.headers.get('user-agent'));

    return NextResponse.json({
      success: true,
      subscriptionId: saved.id,
    });
  } catch (error: any) {
    console.error('[Push Subscribe] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}