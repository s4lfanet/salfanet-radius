import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { spawn, ChildProcess } from 'child_process';
import { openSync, closeSync, existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const LOG_FILE = '/tmp/salfanet-fr-backup.log';
export const BACKUP_SUBDIR = 'backups/freeradius';
// Allow any safe .tar.gz filename (alphanumeric, dash, underscore, dot — no path traversal)
export const SAFE_BACKUP_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9_\-\.]*\.tar\.gz$/;

export function getAppDir(): string {
  const candidates = [
    process.env.SALFANET_APP_DIR,
    '/var/www/salfanet-radius',
    process.cwd(),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
  }
  return '/var/www/salfanet-radius';
}

export function getBackupDir(appDir: string): string {
  const dir = path.join(appDir, BACKUP_SUBDIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

function listBackups(appDir: string): BackupFile[] {
  const dir = getBackupDir(appDir);
  try {
    return readdirSync(dir)
      .filter(f => SAFE_BACKUP_FILENAME.test(f))
      .map(f => {
        const stat = statSync(path.join(dir, f));
        return { name: f, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/** POST — trigger local backup script */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const appDir = getAppDir();
  const scriptPath = path.join(appDir, 'scripts/backup-freeradius-local.sh');
  const backupDir = getBackupDir(appDir);

  if (!existsSync(scriptPath)) {
    return NextResponse.json({ error: `Script not found: ${scriptPath}` }, { status: 500 });
  }

  try {
    const logFd = openSync(LOG_FILE, 'w');
    const child = spawn('bash', [scriptPath], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: appDir,
      env: {
        ...process.env,
        HOME: process.env.HOME || '/root',
        SHELL: '/bin/bash',
        SALFANET_APP_DIR: appDir,
        SALFANET_BACKUP_DIR: backupDir,
      },
    }) as ChildProcess;
    closeSync(logFd);
    child.unref();
    return NextResponse.json({ started: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** GET — return log output + backup file list */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const appDir = getAppDir();
  const log = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf-8') : '';
  const backups = listBackups(appDir);
  return NextResponse.json({ log, backups });
}
