import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import {
  getPushBroadcastHistory,
  getPushDashboardStats,
  sendWebPushBroadcast,
} from '@/server/services/push-notification.service';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const page = Number(searchParams.get('page') || '1');
    const limit = Number(searchParams.get('limit') || '20');

    if (action === 'stats') {
      const stats = await getPushDashboardStats();
      return NextResponse.json({ success: true, stats });
    }

    const history = await getPushBroadcastHistory(limit, page);
    return NextResponse.json({ success: true, ...history });
  } catch (error: any) {
    console.error('[Push Send] GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const title = body.title?.trim();
    const message = body.message?.trim();

    if (!title || !message) {
      return NextResponse.json({ success: false, error: 'Title and message are required' }, { status: 400 });
    }

    const sentBy = (session.user as any)?.username || session.user?.name || session.user?.email || 'admin';
    const result = await sendWebPushBroadcast({
      title,
      body: message,
      type: body.type || 'broadcast',
      recipientRole: body.recipientRole || 'customer',
      targetType: body.targetType || 'all',
      targetIds: Array.isArray(body.targetIds) ? body.targetIds : [],
      sentBy,
      data: body.data || {},
    });

    if (result.total === 0) {
      return NextResponse.json({
        success: false,
        error: 'No users with active web push subscriptions found for the selected target',
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Notification sent to ${result.sent} subscriptions (${result.failed} failed)`,
      broadcast: result.broadcast,
      stats: {
        total: result.total,
        sent: result.sent,
        failed: result.failed,
      },
    });
  } catch (error: any) {
    console.error('[Push Send] POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}