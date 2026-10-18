import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { APK_MAX_BYTES, APK_RELEASES, apkReleaseInfo, saveApkRelease, type ApkTarget } from '@/server/services/apk-release.service';

export const dynamic = 'force-dynamic';

/**
 * The APKs offered on the customer and admin login pages.
 *   GET  → what is published now
 *   POST → multipart { target: customer|admin, file: .apk, note?, mandatory?: '1' } replaces one
 * Super Admin only: whatever is uploaded here is installed by every customer.
 */
async function superAdmin() {
  const auth = await requirePermission('settings.edit');
  if (!auth.authorized) return { error: auth.response };
  if (auth.session.user.role !== 'SUPER_ADMIN') {
    return { error: NextResponse.json({ success: false, error: 'Hanya Super Admin yang bisa mengelola rilis APK.' }, { status: 403 }) };
  }
  return { user: auth.session.user };
}

export async function GET() {
  const check = await superAdmin();
  if (check.error) return check.error;
  const releases = (Object.keys(APK_RELEASES) as ApkTarget[]).map(apkReleaseInfo);
  return NextResponse.json({ success: true, releases, maxBytes: APK_MAX_BYTES });
}

export async function POST(request: NextRequest) {
  const check = await superAdmin();
  if (check.error) return check.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'Kirim file APK lewat form unggah.' }, { status: 400 });
  }
  const target = String(form.get('target') || '') as ApkTarget;
  const file = form.get('file');
  const note = String(form.get('note') || '').slice(0, 200);
  const mandatory = form.get('mandatory') === '1';

  if (!(target in APK_RELEASES)) {
    return NextResponse.json({ success: false, error: 'Pilih aplikasi: pelanggan atau admin.' }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ success: false, error: 'File APK belum dipilih.' }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith('.apk')) {
    return NextResponse.json({ success: false, error: 'File harus berekstensi .apk.' }, { status: 400 });
  }
  if (file.size > APK_MAX_BYTES) {
    return NextResponse.json({ success: false, error: 'Ukuran APK melebihi 50 MB.' }, { status: 413 });
  }

  try {
    const release = saveApkRelease(target, Buffer.from(await file.arrayBuffer()), check.user.username || check.user.name || undefined, note, mandatory);
    console.log(`[APK release] ${target} replaced by ${check.user.username}: ${release.size} bytes, build ${release.versionCode}${mandatory ? ' (wajib)' : ''}`);
    return NextResponse.json({ success: true, release });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal menyimpan APK.';
    console.error('[APK release] upload failed:', e);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
