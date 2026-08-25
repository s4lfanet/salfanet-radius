import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';
export const maxDuration = 600; // 10 minutes — build operations take time

// Clean env for build commands — avoid PM2 env vars interfering with next build
const EXEC_ENV: Record<string, string | undefined> = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin',
  SHELL: '/bin/bash',
  HOME: process.env.HOME || '/root',
  USER: process.env.USER || 'root',
  LANG: process.env.LANG || 'C',
  TERM: 'xterm',
  NODE_ENV: 'production',
  TZ: process.env.TZ || 'Asia/Jakarta',
  DATABASE_URL: process.env.DATABASE_URL,
  SHADOW_DATABASE_URL: process.env.SHADOW_DATABASE_URL,
};

// Run a command via bash and capture full stdout+stderr
async function runCmd(cmd: string, cwd: string, timeout: number): Promise<string> {
  const { stdout, stderr } = await execAsync(cmd, {
    cwd,
    timeout,
    env: EXEC_ENV as any,
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
      await runCmd('git fetch origin master --quiet', appDir, 15000);
    } catch {
      // network issue, continue with local only
    }

    const local = (await runCmd('git rev-parse --short HEAD', appDir, 5000)).trim();

    let remote = local;
    try {
      remote = (await runCmd('git rev-parse --short origin/master', appDir, 5000)).trim();
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

    const logOut = await runCmd(`git log ${logRange} --format='%h|%ci|%an|%s'`, appDir, 10000);

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

    // Step 2: Prisma generate + db push
    try {
      const findPrisma = 'PRISMA_BIN=$(find /var/www/salfanet-radius/node_modules/.pnpm -path "*/prisma/build/index.js" -type f | head -1) && node $PRISMA_BIN generate 2>&1 && node $PRISMA_BIN db push 2>&1';
      const output = await runCmd(findPrisma, `${appDir}/backend`, 120000);
      steps.push({ step: 'Prisma db push', status: 'success', output: output.substring(0, 200) });
    } catch (err: any) {
      steps.push({ step: 'Prisma db push', status: 'error', output: (err.stdout || err.message || '').substring(0, 300) });
    }

    // Step 3: Backend install + generate + build
    try {
      await runCmd('pnpm install --no-frozen-lockfile --force --config.confirm-modules-purges=false 2>&1', appDir, 180000);
      await runCmd('PRISMA_BIN=$(find /var/www/salfanet-radius/node_modules/.pnpm -path "*/prisma/build/index.js" -type f | head -1) && node $PRISMA_BIN generate 2>&1', `${appDir}/backend`, 120000);
      await runCmd('pnpm build 2>&1', `${appDir}/backend`, 300000);
      steps.push({ step: 'Backend build', status: 'success' });
    } catch (err: any) {
      steps.push({ step: 'Backend build', status: 'error', output: (err.stdout || err.stderr || err.message || '').substring(0, 500) });
      return NextResponse.json({ success: false, steps, error: 'Backend build failed' }, { status: 500 });
    }

    // Step 4: Frontend build (install already done from root in step 3)
    try {
      await runCmd('pnpm build 2>&1', `${appDir}/frontend`, 300000);
      steps.push({ step: 'Frontend build', status: 'success' });
    } catch (err: any) {
      steps.push({ step: 'Frontend build', status: 'error', output: (err.stdout || err.stderr || err.message || '').substring(0, 1000) });
      return NextResponse.json({ success: false, steps, error: 'Frontend build failed' }, { status: 500 });
    }

    // Step 5: Restart PM2
    try {
      const output = await runCmd('pm2 restart salfanet-frontend salfanet-backend salfanet-cron --update-env 2>&1', appDir, 30000);
      steps.push({ step: 'PM2 restart', status: 'success', output: output.substring(0, 200) });
    } catch (err: any) {
      steps.push({ step: 'PM2 restart', status: 'error', output: (err.stdout || err.message || '').substring(0, 200) });
      // Don't return error — PM2 restart often writes to stderr but succeeds
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
