import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { execSync, execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { getAppDir, getAppVersion } from '@/server/app-version';

export const dynamic = 'force-dynamic';

function git(cmd: string, appDir: string): string {
  try {
    return execSync(cmd, { cwd: appDir, timeout: 5000, stdio: 'pipe' }).toString().trim();
  } catch {
    return 'unknown';
  }
}

export async function GET() {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;
  const session = authCheck.session;
  if ((session.user as any)?.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const appDir = getAppDir();

  const appVersion = getAppVersion(appDir);

  const localCommit  = git('git rev-parse HEAD', appDir);
  const shortCommit  = localCommit !== 'unknown' ? localCommit.slice(0, 7) : 'unknown';
  const commitDate   = git('git log -1 --format="%ci"', appDir);
  const commitMsg    = git('git log -1 --format="%s"', appDir);
  const gitBranch    = git('git rev-parse --abbrev-ref HEAD', appDir);
  const totalCommits = git('git rev-list --count HEAD', appDir);

  // Auto-version: package.json version + commit count as build suffix
  // e.g. "2.35.0" + 1500 total commits => "2.35.0+1500"
  const autoVersion = totalCommits !== 'unknown'
    ? `${appVersion}+${totalCommits}`
    : appVersion;

  // Fetch remote commit without full pull (fast)
  let remoteCommit = 'unknown';
  let hasUpdate    = false;
  let behindCount  = 0;
  try {
    execSync('git fetch origin master --quiet', { cwd: appDir, timeout: 10000, stdio: 'pipe' });
    remoteCommit = git('git rev-parse origin/master', appDir);
    hasUpdate    = localCommit !== 'unknown' && remoteCommit !== 'unknown' && localCommit !== remoteCommit;
    if (hasUpdate) {
      try {
        behindCount = parseInt(
          execSync('git rev-list --count HEAD..origin/master', { cwd: appDir, timeout: 5000, stdio: 'pipe' }).toString().trim()
        ) || 0;
      } catch { /* ignore */ }
    }
  } catch { /* network unavailable */ }

  const logExists = existsSync('/tmp/salfanet-update.log');
  const pidExists = existsSync('/tmp/salfanet-update.pid');
  let updateRunning = false;
  if (pidExists) {
    try {
      const pid = parseInt(readFileSync('/tmp/salfanet-update.pid', 'utf-8').trim());
      if (Number.isInteger(pid) && pid > 0) {
        execFileSync('kill', ['-0', pid.toString()], { timeout: 2000, stdio: 'pipe' });
        updateRunning = true;
      } else {
        updateRunning = false;
      }
    } catch { updateRunning = false; }
  }

  return NextResponse.json({
    version:       autoVersion,
    baseVersion:   appVersion,
    commit:        shortCommit,
    commitFull:    localCommit,
    commitDate,
    commitMessage: commitMsg,
    gitBranch,
    totalCommits:  totalCommits !== 'unknown' ? parseInt(totalCommits) : 0,
    behindCount,
    remoteCommit:  remoteCommit !== 'unknown' ? remoteCommit.slice(0, 7) : 'unknown',
    hasUpdate,
    updateRunning,
    logExists,
    nodeVersion:   process.version,
    platform:      process.platform,
    uptime:        Math.floor(process.uptime()),
  });
}
