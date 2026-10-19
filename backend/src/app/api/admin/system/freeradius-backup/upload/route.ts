import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { saveUploadedBackup } from '@/server/services/freeradius-backup.service';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 10 * 1024 * 1024;

/** Stores a config archive from another server so it can be restored here. Super Admin only. */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('settings.edit');
  if (!authCheck.authorized) return authCheck.response;
  if (authCheck.session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Hanya Super Admin yang bisa mengunggah backup FreeRADIUS.' }, { status: 403 });
  }

  let file: File | null = null;
  try {
    file = (await request.formData()).get('file') as File | null;
  } catch {
    // handled below
  }
  if (!file || file.size === 0) return NextResponse.json({ error: 'File belum dipilih.' }, { status: 400 });
  if (!file.name.toLowerCase().endsWith('.tar.gz')) return NextResponse.json({ error: 'File harus berekstensi .tar.gz.' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File terlalu besar (maks 10 MB).' }, { status: 400 });

  try {
    const savedAs = saveUploadedBackup(file.name, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ success: true, savedAs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Gagal menyimpan file.' }, { status: 400 });
  }
}
