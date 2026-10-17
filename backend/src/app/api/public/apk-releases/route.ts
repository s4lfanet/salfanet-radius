import { NextResponse } from 'next/server';
import { APK_RELEASES, apkReleaseInfo, type ApkTarget } from '@/server/services/apk-release.service';

export const dynamic = 'force-dynamic';

/**
 * Which login-page APKs exist and their download URLs. The URL carries a
 * content id, so a newly uploaded file is never served from an old CDN copy.
 * Public: the login pages call it before anyone is signed in.
 */
export async function GET() {
  const releases: Record<string, { available: boolean; url?: string; size?: number; updatedAt?: string }> = {};
  for (const target of Object.keys(APK_RELEASES) as ApkTarget[]) {
    const r = apkReleaseInfo(target);
    releases[target] = r.available ? { available: true, url: r.url, size: r.size, updatedAt: r.updatedAt } : { available: false };
  }
  return NextResponse.json({ success: true, releases }, { headers: { 'Cache-Control': 'no-store' } });
}
