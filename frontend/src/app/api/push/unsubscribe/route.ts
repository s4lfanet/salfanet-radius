import { NextResponse } from 'next/server';
import { getCustomerSessionFromRequest } from '@/server/auth/customer-session';
import { removeWebPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: Request) {
  try {
    const session = await getCustomerSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const endpoint = body.endpoint || body.subscription?.endpoint;
    const deleted = await removeWebPushSubscription(session.userId, endpoint);

    return NextResponse.json({
      success: true,
      deleted,
    });
  } catch (error: any) {
    console.error('[Push Unsubscribe] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}