import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

// What each choice restarts. 'app' is what a timezone change needs: the three
// processes that load the company timezone at start (cron schedules in it).
// WhatsApp (Baileys) and FreeRADIUS do not use it, so a timezone change no
// longer drops the WhatsApp connection or interrupts logins.
const APP = ['salfanet-cron', 'salfanet-frontend', 'salfanet-backend'];
const SERVICES: Record<string, { pm2: string[]; freeradius: boolean }> = {
  app: { pm2: APP, freeradius: false },
  cron: { pm2: ['salfanet-cron'], freeradius: false },
  pm2: { pm2: [...APP, 'salfanet-wa'], freeradius: false },
  freeradius: { pm2: [], freeradius: true },
  all: { pm2: [...APP, 'salfanet-wa'], freeradius: true },
};

/** The installed ecosystem.config.js: APP_DIR, PM2's own cwd, or up from this server's folder. */
function findAppDir(): string | null {
  const candidates = [process.env.APP_DIR, process.env.pm_cwd, '/var/www/salfanet-radius'];
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    candidates.push(dir);
    dir = dirname(dir);
  }
  for (const c of candidates) {
    if (c && existsSync(join(c, 'ecosystem.config.js'))) return c;
  }
  return null;
}

export async function GET() {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;
  // Check if running on Linux (production) or Windows (development)
  const isLinux = process.platform === 'linux';
  const isDev = process.env.NODE_ENV === 'development';

  return NextResponse.json({
    platform: process.platform,
    isLinux,
    isDev,
    autoRestartAvailable: isLinux,
  });
}

export async function POST(req: NextRequest) {
  const authCheck = await requirePermission('settings.edit');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const { services, delay = 3000 } = await req.json();

    const plan = typeof services === 'string' ? SERVICES[services] : undefined;
    if (!plan) {
      return NextResponse.json({
        error: `Invalid services parameter. Use: ${Object.keys(SERVICES).join(', ')}`,
      }, { status: 400 });
    }

    // Check if running on Linux (production)
    const isLinux = process.platform === 'linux';
    const isDev = process.env.NODE_ENV === 'development';

    if (!isLinux) {
      // On Windows/Mac (development), timezone changes are applied immediately to frontend
      // No server restart needed for development
      return NextResponse.json({
        success: true,
        message: isDev
          ? 'Development mode: Timezone updated. Changes applied to frontend immediately.'
          : 'Non-Linux platform: Please restart services manually.',
        platform: process.platform,
        isDev,
        autoRestarted: false,
        note: isDev
          ? 'Untuk perubahan server-side, restart dev server dengan: npm run dev'
          : 'Run: pm2 restart all && sudo systemctl restart freeradius',
      });
    }

    const appDir = findAppDir();
    const ecosystem = appDir ? 'ecosystem.config.js' : null;

    // This code runs inside salfanet-backend, so two things matter.
    //
    // 1. The restart must be a DETACHED script (setsid) that outlives the
    //    backend, which is one of the processes being restarted. The web
    //    updater does the same (see run-update.sh).
    //
    // 2. That script must start with a CLEAN environment, again like the
    //    updater (EXEC_ENV). `pm2 restart --update-env` copies the caller's
    //    environment into the restarted process. A child of the backend
    //    carries PORT=3001, so the frontend came back listening on 3001
    //    instead of 3000: nothing on 3000, two apps fighting over 3001, nginx
    //    answering 502 until someone fixed PM2 by hand.
    //
    // Restarting from ecosystem.config.js re-applies each app's own env block
    // (PORT, HOSTNAME, ...), which also repairs a PM2 whose stored env was
    // already polluted by the old behaviour. Without the file, fall back to a
    // plain restart by name (no --update-env), which keeps the stored env.
    const lines: string[] = [];
    if (plan.freeradius) lines.push('sudo -n systemctl restart freeradius');
    if (plan.pm2.length > 0) {
      lines.push(
        ecosystem
          ? `pm2 restart ${ecosystem} --only ${plan.pm2.join(',')} --update-env`
          : `pm2 restart ${plan.pm2.join(' ')}`,
      );
      lines.push('pm2 save');
    }

    const wait = Math.max(1, Math.round(Number(delay) / 1000) || 3);
    const logDir = appDir ? join(appDir, 'logs') : '/tmp';
    try { mkdirSync(logDir, { recursive: true }); } catch { /* the script falls back to /dev/null */ }
    const logFile = join(logDir, 'restart-services.log');
    const script = [
      `exec >> ${JSON.stringify(logFile)} 2>&1 || true`,
      'echo "=== $(date -Is) restart: ' + services + ' ==="',
      `sleep ${wait}`,
      ...(appDir ? [`cd ${JSON.stringify(appDir)}`] : []),
      ...lines.map((l) => `${l} || echo "FAILED: ${l.replace(/"/g, '')}"`),
      'echo "done"',
    ].join('\n');

    const cleanEnv: Record<string, string> = {
      NODE_ENV: 'production',
      PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      HOME: process.env.HOME || '/root',
      USER: process.env.USER || 'root',
      LANG: process.env.LANG || 'C',
      TZ: process.env.TZ || 'Asia/Jakarta',
    };
    if (process.env.PM2_HOME) cleanEnv.PM2_HOME = process.env.PM2_HOME;
    if (appDir) cleanEnv.APP_DIR = appDir;

    const child = spawn('setsid', ['bash', '-c', script], { detached: true, stdio: 'ignore', env: cleanEnv as NodeJS.ProcessEnv });
    child.on('error', (error) => console.error('Restart dispatch error:', error.message));
    child.unref();

    return NextResponse.json({
      success: true,
      message: `Services will restart in ${wait} seconds`,
      services: lines,
      delay,
      autoRestarted: true,
    });

  } catch (error: any) {
    console.error('Restart services error:', error);
    return NextResponse.json(
      { error: 'Failed to restart services', details: error.message },
      { status: 500 }
    );
  }
}
