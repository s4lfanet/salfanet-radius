import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import {
  getFirebaseStatus,
  removeFirebaseFile,
  saveGoogleServices,
  saveServiceAccount,
} from '@/server/services/firebase-config.service';

export const dynamic = 'force-dynamic';

/**
 * Firebase for the native apps' push notifications (optional).
 *   GET    → what is configured (never returns the private key)
 *   POST   → multipart { kind: google-services|service-account, file }
 *   DELETE → ?kind=google-services|service-account
 * Super Admin only: the service account can send pushes to every user.
 */
async function superAdmin() {
  const auth = await requirePermission('settings.edit');
  if (!auth.authorized) return { error: auth.response };
  if (auth.session.user.role !== 'SUPER_ADMIN') {
    return { error: NextResponse.json({ success: false, error: 'Hanya Super Admin yang bisa mengatur Firebase.' }, { status: 403 }) };
  }
  return { user: auth.session.user };
}

const KINDS = ['google-services', 'service-account'] as const;
type Kind = (typeof KINDS)[number];

export async function GET() {
  const check = await superAdmin();
  if (check.error) return check.error;
  return NextResponse.json({ success: true, ...getFirebaseStatus() });
}

export async function POST(request: NextRequest) {
  const check = await superAdmin();
  if (check.error) return check.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'Kirim file lewat form unggah.' }, { status: 400 });
  }
  const kind = String(form.get('kind') || '') as Kind;
  const file = form.get('file');
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ success: false, error: 'Jenis file tidak dikenal.' }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ success: false, error: 'File belum dipilih.' }, { status: 400 });
  }
  if (file.size > 64 * 1024) {
    return NextResponse.json({ success: false, error: 'File terlalu besar untuk file konfigurasi Firebase.' }, { status: 413 });
  }

  try {
    const raw = await file.text();
    if (kind === 'google-services') saveGoogleServices(raw);
    else saveServiceAccount(raw);
    console.log(`[Firebase] ${kind} updated by ${check.user.username}`);
    return NextResponse.json({ success: true, ...getFirebaseStatus() });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Gagal menyimpan file.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const check = await superAdmin();
  if (check.error) return check.error;
  const kind = request.nextUrl.searchParams.get('kind') as Kind | null;
  if (!kind || !KINDS.includes(kind)) {
    return NextResponse.json({ success: false, error: 'Jenis file tidak dikenal.' }, { status: 400 });
  }
  removeFirebaseFile(kind);
  console.log(`[Firebase] ${kind} removed by ${check.user.username}`);
  return NextResponse.json({ success: true, ...getFirebaseStatus() });
}
