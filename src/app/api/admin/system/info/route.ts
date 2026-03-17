import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getAppDir(): string {
  const candidates = [
    process.env.SALFANET_APP_DIR,
    '/var/www/salfanet-radius',
    path.resolve(process.cwd(), '../..'),
    process.cwd(),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
  }

  return '/var/www/salfanet-radius';
}

function git(cmd: string, appDir: string): string {
  try {
    return execSync(cmd, { cwd: appDir, timeout: 5000 }).toString().trim();
  } catch {
    return 'unknown';
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const appDir = getAppDir();

  const pkgPath = path.join(appDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

  const localCommit  = git('git rev-parse HEAD', appDir);
  const shortCommit  = localCommit !== 'unknown' ? localCommit.slice(0, 7) : 'unknown';
  const commitDate   = git('git log -1 --format="%ci"', appDir);
  const commitMsg    = git('git log -1 --format="%s"', appDir);

  // Fetch remote commit without full pull (fast)
  let remoteCommit = 'unknown';
  let hasUpdate    = false;
  try {
    execSync('git fetch origin master --quiet', { cwd: appDir, timeout: 10000 });
    remoteCommit = git('git rev-parse origin/master', appDir);
    hasUpdate    = localCommit !== 'unknown' && remoteCommit !== 'unknown' && localCommit !== remoteCommit;
  } catch { /* network unavailable */ }

  const logExists = existsSync('/tmp/salfanet-update.log');
  const pidExists = existsSync('/tmp/salfanet-update.pid');
  let updateRunning = false;
  if (pidExists) {
    try {
      const pid = parseInt(readFileSync('/tmp/salfanet-update.pid', 'utf-8').trim());
      execSync(`kill -0 ${pid}`, { timeout: 2000 });
      updateRunning = true;
    } catch { updateRunning = false; }
  }

  return NextResponse.json({
    version:       pkg.version,
    commit:        shortCommit,
    commitFull:    localCommit,
    commitDate,
    commitMessage: commitMsg,
    remoteCommit:  remoteCommit !== 'unknown' ? remoteCommit.slice(0, 7) : 'unknown',
    hasUpdate,
    updateRunning,
    logExists,
    nodeVersion:   process.version,
    platform:      process.platform,
    uptime:        Math.floor(process.uptime()),
  });
}
