import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { spawn, execSync } from 'child_process';
import { openSync, closeSync, existsSync, readFileSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const LOG_FILE = '/tmp/salfanet-update.log';
const PID_FILE = '/tmp/salfanet-update.pid';

function isUpdateRunning(): boolean {
  if (!existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
    execSync(`kill -0 ${pid}`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/** GET /api/admin/system/update?action=status  — running + log
 *  GET /api/admin/system/update                — SSE stream */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);

  if (searchParams.get('action') === 'status') {
    return NextResponse.json({
      running: isUpdateRunning(),
      log: existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf-8') : '',
    });
  }

  // SSE: stream live log output to client
  const encoder = new TextEncoder();
  let offset = 0;
  let doneEmitted = false;

  const stream = new ReadableStream({
    start(controller) {
      const tick = () => {
        if (existsSync(LOG_FILE)) {
          const content = readFileSync(LOG_FILE, 'utf-8');
          if (content.length > offset) {
            const chunk = content.slice(offset);
            offset = content.length;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ log: chunk, running: isUpdateRunning() })}\n\n`)
            );
          }
        }

        const running = isUpdateRunning();
        if (!running && offset > 0 && !doneEmitted) {
          doneEmitted = true;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, running: false })}\n\n`));
          clearInterval(intervalId);
          controller.close();
          return;
        }
      };

      // Send initial state immediately
      tick();
      const intervalId = setInterval(tick, 800);

      // Clean up if client disconnects
      request.signal?.addEventListener('abort', () => {
        clearInterval(intervalId);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      Connection:      'keep-alive',
    },
  });
}

/** POST /api/admin/system/update?action=check  — check for new commits only
 *  POST /api/admin/system/update               — trigger full update */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);

  // ── Check only ─────────────────────────────────────────
  if (searchParams.get('action') === 'check') {
    try {
      execSync('git fetch origin master --quiet', { cwd: process.cwd(), timeout: 15000 });
      const local  = execSync('git rev-parse HEAD',          { cwd: process.cwd() }).toString().trim();
      const remote = execSync('git rev-parse origin/master', { cwd: process.cwd() }).toString().trim();

      let changelog = '';
      if (local !== remote) {
        changelog = execSync(`git log --oneline ${local}..${remote}`, { cwd: process.cwd() }).toString().trim();
      }

      return NextResponse.json({
        upToDate:     local === remote,
        localCommit:  local.slice(0, 7),
        remoteCommit: remote.slice(0, 7),
        changelog,
      });
    } catch (e) {
      return NextResponse.json({ error: 'Failed to check: ' + String(e) }, { status: 500 });
    }
  }

  // ── Trigger update ─────────────────────────────────────
  if (isUpdateRunning()) {
    return NextResponse.json({ error: 'Update already running' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({})) as { force?: boolean };
  const args = body.force ? ['--force'] : [];

  const scriptPath = path.join(process.cwd(), 'scripts/update.sh');
  if (!existsSync(scriptPath)) {
    return NextResponse.json({ error: `update.sh not found at: ${scriptPath}` }, { status: 500 });
  }

  try {
    const logFd = openSync(LOG_FILE, 'w');

    const child = spawn('bash', [scriptPath, ...args], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: process.cwd(),
    });

    closeSync(logFd);

    child.on('error', (err) => {
      console.error('[System Update] spawn error:', err);
    });

    child.unref();

    return NextResponse.json({ started: true, script: scriptPath });
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error('[System Update] Failed to start:', msg);
    return NextResponse.json({ error: `Failed to start update process: ${msg}` }, { status: 500 });
  }
}
