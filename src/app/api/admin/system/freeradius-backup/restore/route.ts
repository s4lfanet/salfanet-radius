import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { getAppDir, getBackupDir, SAFE_BACKUP_FILENAME } from '../route';

export const dynamic = 'force-dynamic';

const FR_DIR = '/etc/freeradius/3.0';

const FILES_TO_RESTORE = [
  'clients.conf',
  'clients.d/nas-from-db.conf',
  'mods-available/sql',
  'mods-available/rest',
  'mods-available/mschap',
  'mods-enabled/sql',
  'mods-enabled/rest',
  'policy.d/filter',
  'sites-available/default',
  'sites-available/coa',
  'sites-enabled/default',
];

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { file } = body as { file: string };

  if (!file || !SAFE_BACKUP_FILENAME.test(file)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const appDir = getAppDir();
  const backupDir = path.resolve(getBackupDir(appDir));
  const archivePath = path.resolve(path.join(backupDir, file));

  // Prevent path traversal
  if (!archivePath.startsWith(backupDir + path.sep)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  if (!existsSync(archivePath)) {
    return NextResponse.json({ error: 'Backup file not found' }, { status: 404 });
  }

  const log: string[] = [];
  let tmpDir = '';
  try {
    tmpDir = execSync('mktemp -d', { encoding: 'utf-8' }).trim();

    // Extract archive
    execSync(`tar -xzf "${archivePath}" -C "${tmpDir}"`, { encoding: 'utf-8' });
    log.push('✔ Archive extracted');

    // Detect archive structure: files may be directly in tmpDir, or inside a subdirectory
    // Try root first (check if clients.conf exists directly), else look in first subdir
    let srcDir = tmpDir;
    if (!existsSync(path.join(tmpDir, 'clients.conf'))) {
      const entries = execSync(`ls "${tmpDir}"`, { encoding: 'utf-8' }).trim().split('\n');
      const firstEntry = entries[0];
      if (firstEntry) {
        const candidate = path.join(tmpDir, firstEntry.trim());
        srcDir = candidate;
      }
    }
    log.push(`✔ Config source: ${srcDir.replace(tmpDir, '.')}`);

    // Restore each file
    let restored = 0;
    for (const f of FILES_TO_RESTORE) {
      const src = path.join(srcDir, f);
      const dest = path.join(FR_DIR, f);
      if (existsSync(src)) {
        execSync(`mkdir -p "$(dirname "${dest}")" && cp "${src}" "${dest}"`, {
          encoding: 'utf-8',
          shell: '/bin/bash',
        });
        log.push(`✔ Restored: ${f}`);
        restored++;
      } else {
        log.push(`  SKIP (not in backup): ${f}`);
      }
    }

    // Fix permissions
    execSync(`chown -R freerad:freerad "${FR_DIR}" 2>/dev/null || true`, {
      encoding: 'utf-8',
      shell: '/bin/bash',
    });
    log.push('✔ Permissions fixed');

    // Reload FreeRADIUS
    try {
      execSync('systemctl reload freeradius', { encoding: 'utf-8', timeout: 15000 });
      log.push('✔ FreeRADIUS reloaded');
    } catch {
      log.push('⚠ FreeRADIUS reload failed — restart manually');
    }

    return NextResponse.json({ success: true, restored, log: log.join('\n') });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message, log: [...log, `✘ ERROR: ${e.message}`].join('\n') },
      { status: 500 }
    );
  } finally {
    if (tmpDir) {
      try { execSync(`rm -rf "${tmpDir}"`); } catch { /* ignore */ }
    }
  }
}
