import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

    // Validate services
    const validServices = ['pm2', 'freeradius', 'cron', 'all'];
    if (!services || !validServices.includes(services)) {
      return NextResponse.json({ 
        error: 'Invalid services parameter. Use: pm2, freeradius, cron, or all' 
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

    // NOTE: this code runs inside salfanet-backend. Any pm2 command spawned
    // as a direct child of this process breaks the restart: the child dies
    // with the backend mid-operation, and PM2's God daemon ends up holding
    // the stale listen fd -> EADDRINUSE crash-loop -> 502. The web updater
    // works because it runs `pm2 restart` inside a DETACHED script (see
    // run-update.sh) that survives the backend's death — replicate that:
    // build the whole sequence into ONE detached setsid script, backend last.
    const commands: string[] = [];

    if (services === 'freeradius' || services === 'all') {
      commands.push('sudo systemctl restart freeradius');
    }

    if (services === 'cron' || services === 'all' || services === 'pm2') {
      commands.push('pm2 restart salfanet-cron --update-env');
    }

    if (services === 'pm2' || services === 'all') {
      commands.push('pm2 restart salfanet-wa --update-env');
      commands.push('pm2 restart salfanet-frontend --update-env');
      commands.push('pm2 restart salfanet-backend --update-env');
    }

    const script = `sleep ${Math.max(1, Math.round(delay / 1000))}; ${commands.join('; ')}`;
    execAsync(`setsid bash -c ${JSON.stringify(script)} </dev/null >/dev/null 2>&1 &`).catch(
      (error: any) => console.error('Restart dispatch error:', error.message)
    );

    return NextResponse.json({
      success: true,
      message: `Services will restart in ${delay / 1000} seconds`,
      services: commands,
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
