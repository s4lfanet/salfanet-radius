import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { getApkSource, setApkSource } from '@/server/services/apk-release.service';

export const dynamic = 'force-dynamic';

/**
 * Where the in-app updater gets new APKs: the file uploaded in Download APK
 * ('upload') or the latest GitHub build ('github'). Super Admin only: it
 * decides what every installed app downloads.
 */
async function superAdmin() {
  const auth = await requirePermission('settings.edit');
  if (!auth.authorized) return { error: auth.response };
  if (auth.session.user.role !== 'SUPER_ADMIN') {
    return { error: NextResponse.json({ success: false, error: 'Hanya Super Admin yang bisa mengubah sumber pembaruan APK.' }, { status: 403 }) };
  }
  return {};
}

export async function GET() {
  const check = await superAdmin();
  if (check.error) return check.error;
  return NextResponse.json({ success: true, source: getApkSource() });
}

export async function PUT(request: NextRequest) {
  const check = await superAdmin();
  if (check.error) return check.error;
  const body = (await request.json().catch(() => ({}))) as { source?: string };
  if (body.source !== 'upload' && body.source !== 'github') {
    return NextResponse.json({ success: false, error: 'source harus upload atau github' }, { status: 400 });
  }
  setApkSource(body.source);
  return NextResponse.json({ success: true, source: body.source });
}
