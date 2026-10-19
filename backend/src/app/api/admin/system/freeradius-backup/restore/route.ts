import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { restoreBackup, SAFE_BACKUP_FILENAME } from '@/server/services/freeradius-backup.service';

export const dynamic = 'force-dynamic';

/**
 * Restores a FreeRADIUS config archive. Super Admin only: it rewrites
 * files FreeRADIUS runs as root and restarts it.
 * Body: { file, keepLocal?: boolean } (keepLocal defaults to true: this
 * server's database login and API address are kept).
 */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('settings.edit');
  if (!authCheck.authorized) return authCheck.response;
  if (authCheck.session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ success: false, error: 'Hanya Super Admin yang bisa me-restore FreeRADIUS.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { file?: string; keepLocal?: boolean };
  if (!body.file || !SAFE_BACKUP_FILENAME.test(body.file)) {
    return NextResponse.json({ success: false, error: 'Nama file tidak valid.' }, { status: 400 });
  }

  const result = restoreBackup(body.file, { keepLocal: body.keepLocal !== false });
  console.log(`[FreeRADIUS restore] ${body.file} by ${authCheck.session.user.username}: ${result.success ? 'ok' : result.error}`);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
