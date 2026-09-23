import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { registerCustomerPushToken, removeCustomerPushToken } from '@/server/services/fcm-push.service';

/**
 * POST /api/customer/push-token  — register the Flutter app's FCM device token
 * DELETE /api/customer/push-token?token=...  — unregister (e.g. on logout)
 */
async function verifyCustomerToken(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;

  return prisma.customerSession.findFirst({
    where: {
      token,
      verified: true,
      expiresAt: { gte: new Date() },
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await verifyCustomerToken(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { token, platform } = body as { token?: string; platform?: string };

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, error: 'token is required' }, { status: 400 });
    }

    await registerCustomerPushToken(session.userId, token, platform || 'android');
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[Customer push-token] register error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await verifyCustomerToken(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const removed = await removeCustomerPushToken(session.userId, token);
    return NextResponse.json({ success: true, removed });
  } catch (error: unknown) {
    console.error('[Customer push-token] remove error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
