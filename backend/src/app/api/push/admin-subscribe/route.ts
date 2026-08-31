import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/server/middleware/api-auth';
import { upsertAdminPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: NextRequest) {
  try {
    const authCheck = await checkAuth();
    if (!authCheck.authorized) return authCheck.response;
    const { userId } = authCheck;

    const body = await request.json();
    const { subscription } = body;

    if (!subscription) {
      return NextResponse.json({ success: false, error: 'subscription is required' }, { status: 400 });
    }

    const saved = await upsertAdminPushSubscription(userId, subscription, request.headers.get('user-agent'));

    return NextResponse.json({ success: true, subscriptionId: saved.id });
  } catch (error: any) {
    console.error('[Admin Push Subscribe] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
