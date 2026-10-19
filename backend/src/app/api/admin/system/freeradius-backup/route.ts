import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { listBackups, readBackupLog, runBackupWithLog } from '@/server/services/freeradius-backup.service';

export const dynamic = 'force-dynamic';

/**
 * Backups of the FreeRADIUS config.
 *   GET  → last backup log + list of archives
 *   POST → make a backup now (Super Admin)
 */
export async function GET() {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;
  return NextResponse.json({ log: readBackupLog(), backups: listBackups() });
}

export async function POST() {
  const authCheck = await requirePermission('settings.edit');
  if (!authCheck.authorized) return authCheck.response;
  if (authCheck.session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Hanya Super Admin yang bisa membuat backup FreeRADIUS.' }, { status: 403 });
  }
  // A config archive takes well under a second; done before responding.
  const result = runBackupWithLog();
  return NextResponse.json({ started: true, success: result.ok, file: result.file, log: result.log }, { status: result.ok ? 200 : 500 });
}
