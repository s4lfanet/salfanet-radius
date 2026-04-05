import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { spawn, ChildProcess } from 'child_process';
import { openSync, closeSync, existsSync, readFileSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const LOG_FILE = '/tmp/salfanet-fr-backup.log';

function getAppDir(): string {
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

/** POST — trigger backup script */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const appDir = getAppDir();
  const scriptPath = path.join(appDir, 'scripts/backup-freeradius-to-git.sh');

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
        USER: process.env.USER || 'root',
        SHELL: '/bin/bash',
        SALFANET_APP_DIR: appDir,
      },
    }) as ChildProcess;

    closeSync(logFd);
    child.unref();

    return NextResponse.json({ started: true, logFile: LOG_FILE });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** GET — return log output */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const log = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf-8') : '';
  return NextResponse.json({ log });
}
