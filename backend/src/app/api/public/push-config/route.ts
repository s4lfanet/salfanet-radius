import { NextRequest, NextResponse } from 'next/server';
import { APP_PACKAGES, getAppFirebaseOptions, type PushApp } from '@/server/services/firebase-config.service';

export const dynamic = 'force-dynamic';

/**
 * How the native app should receive notifications from this server.
 * Public: the app asks before sign-in, right after the server URL is set.
 *   { mode: 'fcm', fcm: {...} }   start Firebase with these options
 *   { mode: 'poll', pollMinutes } no Firebase here — check for new
 *                                 notifications in the background instead
 * Firebase client options are not secret; they ship inside every APK.
 */
export async function GET(req: NextRequest) {
  const app = req.nextUrl.searchParams.get('app') as PushApp | null;
  if (!app || !(app in APP_PACKAGES)) {
    return NextResponse.json({ success: false, error: 'app harus customer atau admin' }, { status: 400 });
  }
  const fcm = getAppFirebaseOptions(app);
  return NextResponse.json(
    fcm ? { success: true, mode: 'fcm', fcm } : { success: true, mode: 'poll', pollMinutes: 15 },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
