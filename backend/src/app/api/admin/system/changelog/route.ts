import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { getAppDir } from '@/server/app-version';

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
function readStatus(): { phase: string; step?: string; steps?: any[]; newCommit?: string; error?: string; startedAt?: number; finishedAt?: number; logTail?: string } | null {
  try {
    if (!existsSync(STATUS_FILE)) return null;
    const raw = readFileSync(STATUS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Last lines of the update log, without terminal colour codes or secrets. */
function readLogTail(lines: number): string | undefined {
  try {
    if (!existsSync(LOG_FILE)) return undefined;
    return readFileSync(LOG_FILE, 'utf-8')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;]*m/g, '')
      .split('\n')
      .filter((l) => l.trim() && !/(SECRET|PASSWORD|DATABASE_URL)=/i.test(l))
      .slice(-lines)
      .join('\n');
  } catch {
    return undefined;
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
      // On failure, the end of the log says why (the status only names the step).
      if (status?.phase === 'error') status.logTail = readLogTail(40);
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

# The script starts with a clean environment (EXEC_ENV), but next build
# loads every route, and auth refuses to load without NEXTAUTH_SECRET in
# production. Take the secrets from the .env files, backend first, as
# deploy.sh effectively does.
env_value() {
  for f in backend/.env frontend/.env; do
    v=$(sed -n "s/^$1=//p" "$f" 2>/dev/null | tail -1 | tr -d '"' | tr -d "'")
    if [ -n "$v" ]; then echo "$v"; return; fi
  done
}
export DATABASE_URL=$(env_value DATABASE_URL)
export SHADOW_DATABASE_URL=$(env_value SHADOW_DATABASE_URL)
export NEXTAUTH_SECRET=$(env_value NEXTAUTH_SECRET)
export NEXTAUTH_URL=$(env_value NEXTAUTH_URL)
export NEXT_TELEMETRY_DISABLED=1

# Same copies as deploy.sh: the standalone server serves public/ and
# .next/static/ from inside .next/standalone/<app>/.
copy_standalone() {
  local app="$1"
  local out="$app/.next/standalone/$app"
  [ -d "$out" ] || return 0
  [ -d "$app/public" ] && { mkdir -p "$out/public"; cp -r "$app/public/." "$out/public/"; }
  [ -d "$app/.next/static" ] && { mkdir -p "$out/.next"; rm -rf "$out/.next/static"; cp -r "$app/.next/static" "$out/.next/static"; }
  [ -f "$app/.env" ] && cp "$app/.env" "$out/.env"
  return 0
}

# One retry with an empty build cache, run from inside the app's folder. A
# fetch that fails once during a build (Google Fonts, for one) can be cached
# by Turbopack and fail every later build until .next/cache is removed.
retry_clean_build() {
  log "Build $1 failed; retrying once with an empty .next/cache"
  rm -rf .next/cache
  if [ "$1" = "backend" ]; then
    NODE_OPTIONS="--max-old-space-size=1536" pnpm build >> "$LOG_FILE" 2>&1
  else
    pnpm build >> "$LOG_FILE" 2>&1
  fi
}

log "=== UPDATE STARTED ==="

# A build needs a few GB of free disk; stop before touching anything when it
# is not there, instead of failing halfway with ENOSPC.
FREE_MB=$(( $(df -Pk "${appDir}" | awk 'NR==2 {print $4}') / 1024 ))
if [ "$FREE_MB" -lt 3072 ]; then
  write_status '{"phase":"error","step":"Git pull","error":"Disk hampir penuh: sisa '$FREE_MB' MB, butuh minimal 3072 MB. Kosongkan ruang disk lalu coba lagi.","finishedAt":'$(date +%s)'}'
  log "ERROR: only $FREE_MB MB free"
  exit 1
fi

# Step 1: Git pull (fetch + hard reset so rewritten upstream history still works)
write_status '{"phase":"running","step":"Git pull","startedAt":'$(date +%s)'}'
log "Step 1: Git pull (fetch + reset)"
git fetch origin master >> "$LOG_FILE" 2>&1 && git reset --hard origin/master >> "$LOG_FILE" 2>&1
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
# No --force: it installs every optional binary for every platform
# (sharp for riscv64, s390x, ...) and fills the disk.
pnpm install --no-frozen-lockfile --config.confirm-modules-purges=false >> "$LOG_FILE" 2>&1
cd "${appDir}/backend"
node $PRISMA_BIN generate >> "$LOG_FILE" 2>&1
NODE_OPTIONS="--max-old-space-size=1536" pnpm build >> "$LOG_FILE" 2>&1 || retry_clean_build backend
if [ $? -ne 0 ]; then
  write_status '{"phase":"error","step":"Backend build","error":"backend build failed","finishedAt":'$(date +%s)'}'
  log "ERROR: Backend build failed"
  exit 1
fi
cd "${appDir}"
copy_standalone backend
log "Backend build OK"

# Step 4: Frontend build
write_status '{"phase":"running","step":"Frontend build"}'
log "Step 4: Frontend build"
cd "${appDir}/frontend"
pnpm build >> "$LOG_FILE" 2>&1 || retry_clean_build frontend
if [ $? -ne 0 ]; then
  write_status '{"phase":"error","step":"Frontend build","error":"frontend build failed","finishedAt":'$(date +%s)'}'
  log "ERROR: Frontend build failed"
  exit 1
fi
cd "${appDir}"
copy_standalone frontend
log "Frontend build OK"

# Step 5: Restart PM2 (use reload, NOT delete+start — delete kills the backend
# which is the parent of this script, killing the script before pm2 start runs)
write_status '{"phase":"running","step":"PM2 restart"}'
log "Step 5: PM2 restart (reload mode)"
cd "${appDir}"
# Reload frontend first (it doesn't kill this script's parent)
pm2 reload salfanet-frontend --update-env >> "$LOG_FILE" 2>&1 || pm2 restart salfanet-frontend --update-env >> "$LOG_FILE" 2>&1 || true
log "Frontend reloaded"
# Reload backend last — this will restart the backend process.
# The script survives because it's fully detached via setsid.
pm2 reload salfanet-backend --update-env >> "$LOG_FILE" 2>&1 || pm2 restart salfanet-backend --update-env >> "$LOG_FILE" 2>&1 || true
log "Backend reloaded"
pm2 restart salfanet-cron --update-env >> "$LOG_FILE" 2>&1 || true
pm2 save >> "$LOG_FILE" 2>&1
log "PM2 restart OK"

# Backend memory limit in the installed ecosystem.config.js.
if [ -f "${appDir}/deploy/fix-pm2-limits.sh" ]; then
  APP_DIR="${appDir}" bash "${appDir}/deploy/fix-pm2-limits.sh" --apply >> "$LOG_FILE" 2>&1 || true
fi

# /uploads/ in the nginx site; installer-made sites lacked it.
if [ -f "${appDir}/deploy/fix-nginx-uploads.sh" ]; then
  APP_DIR="${appDir}" bash "${appDir}/deploy/fix-nginx-uploads.sh" >> "$LOG_FILE" 2>&1 || true
fi

# FreeRADIUS fixes that only new installs get from the installer.
if [ -f "${appDir}/deploy/freeradius/fix-runtime-config.sh" ]; then
  bash "${appDir}/deploy/freeradius/fix-runtime-config.sh" >> "$LOG_FILE" 2>&1 || true
fi

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

    // Spawn detached background process using setsid for full detachment.
    // This ensures the script survives even if the parent backend process is restarted/killed.
    const child = spawn('setsid', ['bash', scriptPath], {
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
