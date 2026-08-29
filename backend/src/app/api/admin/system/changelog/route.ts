import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // POST returns immediately; background script runs independently

// Status file for background update process
const STATUS_DIR = '/tmp/salfanet-update';
const STATUS_FILE = `${STATUS_DIR}/status.json`;
const LOG_FILE = `${STATUS_DIR}/update.log`;

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

// Write status JSON for polling
function writeStatus(status: {
  phase: 'idle' | 'running' | 'done' | 'error';
  step?: string;
  steps?: { step: string; status: 'success' | 'error' | 'skipped'; output?: string }[];
  newCommit?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}) {
  try {
    if (!existsSync(STATUS_DIR)) mkdirSync(STATUS_DIR, { recursive: true });
    writeFileSync(STATUS_FILE, JSON.stringify(status));
  } catch (e) {
    console.error('[UPDATE] Failed to write status:', e);
  }
}

// Read status JSON for polling
function readStatus(): { phase: string; step?: string; steps?: any[]; newCommit?: string; error?: string; startedAt?: number; finishedAt?: number } | null {
  try {
    if (!existsSync(STATUS_FILE)) return null;
    const raw = readFileSync(STATUS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * GET /api/admin/system/changelog
 * - Without ?action=status: Returns git log of commits between local HEAD and remote
 * - With ?action=status: Returns current background update status for polling
 */
export async function GET(req: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;

    // Poll update status if requested
    const action = new URL(req.url).searchParams.get('action');
    if (action === 'status') {
      const status = readStatus();
      return NextResponse.json({ success: true, status: status || { phase: 'idle' } });
    }

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
 * Spawns a detached background shell script that runs:
 *   git pull + prisma db push + build backend + build frontend + restart PM2
 * Returns immediately with { phase: 'running' } so the frontend can poll GET ?action=status
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

    // Check if update is already running
    const current = readStatus();
    if (current?.phase === 'running') {
      return NextResponse.json({
        success: false,
        error: 'Update sedang berjalan. Tunggu hingga selesai.',
        status: current,
      }, { status: 409 });
    }

    const appDir = getAppDir();

    // Write the background update script
    if (!existsSync(STATUS_DIR)) mkdirSync(STATUS_DIR, { recursive: true });

    const scriptPath = `${STATUS_DIR}/run-update.sh`;
    const script = `#!/bin/bash
source /etc/profile 2>/dev/null
export PATH=$PATH:/usr/local/bin:/usr/bin:/bin
export HOME=/root
cd "${appDir}"

STATUS_FILE="${STATUS_FILE}"
LOG_FILE="${LOG_FILE}"

write_status() {
  echo "$1" > "$STATUS_FILE"
}

log() {
  echo "[$(date '+%H:%M:%S')] $1" >> "$LOG_FILE"
}

log "=== UPDATE STARTED ==="

# Step 1: Git pull
write_status '{"phase":"running","step":"Git pull","startedAt":'$(date +%s)'}'
log "Step 1: Git pull"
git pull origin master >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
  write_status '{"phase":"error","step":"Git pull","error":"git pull failed","finishedAt":'$(date +%s)'}'
  log "ERROR: Git pull failed"
  exit 1
fi
log "Git pull OK"

# Step 2: Prisma generate + db push
write_status '{"phase":"running","step":"Prisma db push"}'
log "Step 2: Prisma generate + db push"
cd "${appDir}/backend"
PRISMA_BIN=$(find /var/www/salfanet-radius/node_modules/.pnpm -path "*/prisma/build/index.js" -type f | head -1)
node $PRISMA_BIN generate >> "$LOG_FILE" 2>&1
node $PRISMA_BIN db push >> "$LOG_FILE" 2>&1
log "Prisma OK (warnings ignored)"

# Step 3: Backend build
write_status '{"phase":"running","step":"Backend build"}'
log "Step 3: Backend install + build"
cd "${appDir}"
pnpm install --no-frozen-lockfile --force --config.confirm-modules-purges=false >> "$LOG_FILE" 2>&1
cd "${appDir}/backend"
node $PRISMA_BIN generate >> "$LOG_FILE" 2>&1
pnpm build >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
  write_status '{"phase":"error","step":"Backend build","error":"backend build failed","finishedAt":'$(date +%s)'}'
  log "ERROR: Backend build failed"
  exit 1
fi
log "Backend build OK"

# Step 4: Frontend build
write_status '{"phase":"running","step":"Frontend build"}'
log "Step 4: Frontend build"
cd "${appDir}/frontend"
pnpm build >> "$LOG_FILE" 2>&1
if [ $? -ne 0 ]; then
  write_status '{"phase":"error","step":"Frontend build","error":"frontend build failed","finishedAt":'$(date +%s)'}'
  log "ERROR: Frontend build failed"
  exit 1
fi
log "Frontend build OK"

# Step 5: Restart PM2
write_status '{"phase":"running","step":"PM2 restart"}'
log "Step 5: PM2 restart"
cd "${appDir}"
export DATABASE_URL=$(awk -F= '/^DATABASE_URL=/{gsub(/"/,"");print $2}' backend/.env)
export SHADOW_DATABASE_URL=$(awk -F= '/^SHADOW_DATABASE_URL=/{gsub(/"/,"");print $2}' backend/.env 2>/dev/null || true)
export NEXTAUTH_SECRET=$(awk -F= '/^NEXTAUTH_SECRET=/{gsub(/"/,"");print $2}' frontend/.env 2>/dev/null || true)
export NEXTAUTH_URL=$(awk -F= '/^NEXTAUTH_URL=/{gsub(/"/,"");print $2}' frontend/.env 2>/dev/null || true)
pm2 delete salfanet-frontend salfanet-backend salfanet-cron 2>/dev/null
pm2 start ecosystem.config.js --only salfanet-frontend,salfanet-backend,salfanet-cron >> "$LOG_FILE" 2>&1
pm2 save >> "$LOG_FILE" 2>&1
log "PM2 restart OK"

# Done
NEW_COMMIT=$(git rev-parse --short HEAD)
write_status '{"phase":"done","step":"Complete","newCommit":"'"$NEW_COMMIT"'","finishedAt":'$(date +%s)'}'
log "=== UPDATE COMPLETE: $NEW_COMMIT ==="
`;

    writeFileSync(scriptPath, script);
    // Make executable
    await execAsync(`chmod +x ${scriptPath}`);

    // Clear old log
    try { unlinkSync(LOG_FILE); } catch {}

    // Write initial status
    writeStatus({ phase: 'running', step: 'Starting...', startedAt: Date.now() / 1000 | 0 });

    // Spawn detached background process
    const child = spawn('bash', [scriptPath], {
      detached: true,
      stdio: 'ignore',
      env: EXEC_ENV as any,
    });
    child.unref();

    return NextResponse.json({
      success: true,
      message: 'Update dimulai di background. Polling status untuk melihat progress.',
      status: { phase: 'running', step: 'Starting...' },
    });
  } catch (error: any) {
    console.error('System update error:', error);
    return NextResponse.json({ error: 'Failed to start update', detail: error.message }, { status: 500 });
  }
}
