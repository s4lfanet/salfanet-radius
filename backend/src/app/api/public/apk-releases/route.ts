import { NextRequest, NextResponse } from 'next/server';
import { APK_RELEASES, apkReleaseInfo, getApkSource, githubReleaseInfo, type ApkTarget } from '@/server/services/apk-release.service';

export const dynamic = 'force-dynamic';

/**
 * Which login-page APKs exist and their download URLs. The URL carries a
 * content id, so a newly uploaded file is never served from an old CDN copy.
 * Public: the login pages call it before anyone is signed in, and the apps
 * call it to offer an update (versionCode above the installed one; below
 * minVersionCode the update is required).
 *
 * With the GitHub source on (Download APK page), the apps are offered the
 * latest GitHub build for the phone's ABI (?abi=arm64-v8a); when GitHub
 * cannot be reached the uploaded APK is offered instead.
 */
type PublicRelease = {
  available: boolean;
  url?: string;
  size?: number;
  updatedAt?: string;
  versionCode?: number;
  versionName?: string;
  minVersionCode?: number;
  note?: string;
};

export async function GET(request: NextRequest) {
  const abi = request.nextUrl.searchParams.get('abi');
  const github = getApkSource() === 'github';
  const releases: Record<string, PublicRelease> = {};
  for (const target of Object.keys(APK_RELEASES) as ApkTarget[]) {
    const r = (github ? await githubReleaseInfo(target, abi) : null) ?? apkReleaseInfo(target);
    releases[target] = r.available
      ? {
          available: true,
          url: r.url,
          size: r.size,
          updatedAt: r.updatedAt,
          versionCode: r.versionCode,
          versionName: r.versionName,
          minVersionCode: r.minVersionCode,
          note: r.note,
        }
      : { available: false };
  }
  return NextResponse.json({ success: true, releases, source: github ? 'github' : 'upload' }, { headers: { 'Cache-Control': 'no-store' } });
}
