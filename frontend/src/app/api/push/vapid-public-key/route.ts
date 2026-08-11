import { NextResponse } from 'next/server';
import { getPublicVapidKey } from '@/server/services/push-notification.service';

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      publicKey: getPublicVapidKey(),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 503 });
  }
}