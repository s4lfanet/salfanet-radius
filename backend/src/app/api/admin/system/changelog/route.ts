import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

// Ensure PATH includes common binary locations for PM2 standalone processes
const EXEC_ENV = {
  ...process.env,
  PATH: `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${process.env.PATH || ''}`,
  SHELL: '/bin/bash',
};

// Run a command via bash and capture full stdout+stderr
async function runCmd(cmd: string, cwd: string, timeout: number): Promise<string> {
  const { stdout, stderr } = await execAsync(cmd, {
    cwd,
    timeout,
    env: EXEC_ENV,
    shell: '/bin/bash',
    maxBuffer: 1024 * 1024 * 10,
  });
  return (stdout + stderr).trim();
}

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

/**
 * GET /api/admin/system/changelog
 * Returns git log of commits between local HEAD and remote, or last 20 if up to date
 */
export async function GET() {
  try {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;

    const appDir = getAppDir();

    // Fetch remote
    try {
      await execAsync('git fetch origin master --quiet', { cwd: appDir, timeout: 15000 });
    } catch {
      // network issue, continue with local only
    }

    const { stdout: localOut } = await execAsync('git rev-parse --short HEAD', { cwd: appDir, timeout: 5000 });
    const local = localOut.trim();

    let remote = local;
    try {
      const { stdout: remoteOut } = await execAsync('git rev-parse --short origin/master', { cwd: appDir, timeout: 5000 });
      remote = remoteOut.trim();
    } catch {
      // ignore
    }

    const hasUpdate = local !== remote;

    // Get commits: if update available, show what's new; otherwise show last 20
    let logRange: string;
    if (hasUpdate) {
      logRange = 'HEAD..origin/master';
    } else {
      logRange = '-20';
    }

    const { stdout: logOut } = await execAsync(
      `git log ${logRange} --format='%h|%ci|%an|%s'`,
      { cwd: appDir, timeout: 10000 }
    );

    const commits = logOut.trim().split('\n').filter(Boolean).map(line => {
      const [hash, date, author, ...subjectParts] = line.split('|');
      return {
        hash: hash?.trim() || '',
        date: date?.trim() || '',
        author: author?.trim() || '',
        subject: subjectParts.join('|').trim() || '',
      };
    });

    return NextResponse.json({
      success: true,
      hasUpdate,
      localCommit: local,
      remoteCommit: remote,
      commits,
    });
  } catch (error: any) {
    console.error('Changelog error:', error);
    return NextResponse.json({ error: 'Failed to get changelog', detail: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/system/changelog
 * Body: { action: 'update' }
 * Runs git pull + prisma db push + build backend + build frontend + restart PM2
 */
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;

    const body = await req.json();
    const { action } = body;

    if (action !== 'update') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const appDir = getAppDir();
    const steps: { step: string; status: 'success' | 'error' | 'skipped'; output?: string }[] = [];

    // Step 1: Git pull
    try {
      const output = await runCmd('git pull origin master 2>&1', appDir, 60000);
      steps.push({ step: 'Git pull', status: 'success', output: output.substring(0, 200) });
    } catch (err: any) {
      steps.push({ step: 'Git pull', status: 'error', output: (err.stdout || err.message || '').substring(0, 200) });
      return NextResponse.json({ success: false, steps, error: 'Git pull failed' }, { status: 500 });
    }

    // Step 2: Prisma db push
    try {
      const output = await runCmd('npx prisma db push 2>&1', `${appDir}/backend`, 120000);
      steps.push({ step: 'Prisma db push', status: 'success', output: output.substring(0, 200) });
    } catch (err: any) {
      steps.push({ step: 'Prisma db push', status: 'error', output: (err.stdout || err.message || '').substring(0, 200) });
    }

    // Step 3: Backend install + build
    try {
      await runCmd('pnpm install --no-frozen-lockfile 2>&1', `${appDir}/backend`, 120000);
      await runCmd('pnpm build 2>&1', `${appDir}/backend`, 180000);
      steps.push({ step: 'Backend build', status: 'success' });
    } catch (err: any) {
      steps.push({ step: 'Backend build', status: 'error', output: (err.stdout || err.stderr || err.message || '').substring(0, 300) });
      return NextResponse.json({ success: false, steps, error: 'Backend build failed' }, { status: 500 });
    }

    // Step 4: Frontend install + build
    try {
      await runCmd('pnpm install --no-frozen-lockfile 2>&1', `${appDir}/frontend`, 120000);
      await runCmd('pnpm build 2>&1', `${appDir}/frontend`, 180000);
      steps.push({ step: 'Frontend build', status: 'success' });
    } catch (err: any) {
      steps.push({ step: 'Frontend build', status: 'error', output: (err.stdout || err.stderr || err.message || '').substring(0, 300) });
      return NextResponse.json({ success: false, steps, error: 'Frontend build failed' }, { status: 500 });
    }

    // Step 5: Restart PM2
    try {
      const output = await runCmd('pm2 restart salfanet-frontend salfanet-backend salfanet-cron 2>&1', appDir, 30000);
      steps.push({ step: 'PM2 restart', status: 'success', output: output.substring(0, 200) });
    } catch (err: any) {
      steps.push({ step: 'PM2 restart', status: 'error', output: (err.stdout || err.message || '').substring(0, 200) });
      return NextResponse.json({ success: false, steps, error: 'PM2 restart failed' }, { status: 500 });
    }

    // Get new commit
    let newCommit = '';
    try {
      const output = await runCmd('git rev-parse --short HEAD', appDir, 5000);
      newCommit = output.trim();
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      message: 'Update berhasil! Semua service sudah direstart.',
      newCommit,
      steps,
    });
  } catch (error: any) {
    console.error('System update error:', error);
    return NextResponse.json({ error: 'Failed to process update', detail: error.message }, { status: 500 });
  }
}
