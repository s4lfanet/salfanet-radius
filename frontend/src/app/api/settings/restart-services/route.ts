import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
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
  try {
    // Check authorization
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { services, delay = 3000 } = await req.json();

    // Validate services
    const validServices = ['pm2', 'freeradius', 'all'];
    if (!services || !validServices.includes(services)) {
      return NextResponse.json({ 
        error: 'Invalid services parameter. Use: pm2, freeradius, or all' 
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

    // Schedule restart after delay (so response can be sent first)
    const commands: string[] = [];
    
    if (services === 'pm2' || services === 'all') {
      commands.push('pm2 restart all --update-env');
    }
    
    if (services === 'freeradius' || services === 'all') {
      commands.push('sudo systemctl restart freeradius');
    }

    // Execute restart in background after delay
    setTimeout(async () => {
      for (const cmd of commands) {
        try {
          console.log(`Executing: ${cmd}`);
          await execAsync(cmd);
          console.log(`Success: ${cmd}`);
        } catch (error: any) {
          console.error(`Error executing ${cmd}:`, error.message);
        }
      }
    }, delay);

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
