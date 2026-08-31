import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/server/middleware/api-auth';
import { removeAdminPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: NextRequest) {
  try {
    const authCheck = await checkAuth();
    if (!authCheck.authorized) return authCheck.response;
    const { userId } = authCheck;

    const body = await request.json().catch(() => ({}));
    const { endpoint, subscription } = body;

    const endpointUrl = endpoint || subscription?.endpoint;
    const deleted = await removeAdminPushSubscription(userId, endpointUrl);

    return NextResponse.json({ success: true, deleted });
  } catch (error: any) {
    console.error('[Admin Push Unsubscribe] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
