import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logActivity } from '@/server/services/activity-log.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
  try {
    // Get FreeRADIUS service status
    const { stdout } = await execAsync('systemctl status freeradius');
    
    // Parse uptime from output
    // Format: "Active: active (running) since Thu 2025-10-30 02:00:34 WIB; 43s ago"
    const uptimeMatch = stdout.match(/Active: active \(running\) since (.+?); (.+?) ago/);
    const isActive = stdout.includes('Active: active (running)');
    
    let uptime = 'Unknown';
    if (uptimeMatch && uptimeMatch[2]) {
      // Parse the "ago" part directly
      const agoText = uptimeMatch[2].trim();
      
      // Could be "43s", "5min 43s", "2h 30min", "3 days 2h", etc.
      const days = agoText.match(/(\d+)\s*day/);
      const hours = agoText.match(/(\d+)h/);
      const minutes = agoText.match(/(\d+)min/);
      const seconds = agoText.match(/(\d+)s/);
      
      const parts = [];
      if (days) parts.push(`${days[1]}d`);
      if (hours) parts.push(`${hours[1]}h`);
      if (minutes) parts.push(`${minutes[1]}m`);
      if (!days && !hours && !minutes && seconds) parts.push(`${seconds[1]}s`);
      
      uptime = parts.length > 0 ? parts.join(' ') : agoText;
    }
    
    return NextResponse.json({
      success: true,
      status: isActive ? 'running' : 'stopped',
      uptime: isActive ? uptime : 'N/A',
    });
  } catch (error: any) {
    console.error('RADIUS status check error:', error);
    return NextResponse.json({
      success: true,
      status: 'stopped',
      uptime: 'N/A',
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    if (action !== 'restart') {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }
    
    // Restart FreeRADIUS service
    await execAsync('systemctl restart freeradius');
    
    // Wait a bit and check status
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const { stdout } = await execAsync('systemctl status freeradius');
    const isActive = stdout.includes('Active: active (running)');
    
    if (isActive) {
      // Log activity
      try {
        const session = await getServerSession(authOptions);
        await logActivity({
          userId: (session?.user as any)?.id,
          username: (session?.user as any)?.username || 'Admin',
          userRole: (session?.user as any)?.role,
          action: 'RESTART_RADIUS',
          description: 'Restarted FreeRADIUS service',
          module: 'system',
          status: 'success',
          request,
        });
      } catch (logError) {
        console.error('Activity log error:', logError);
      }

      return NextResponse.json({
        success: true,
        message: 'FreeRADIUS restarted successfully',
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Service failed to start' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('RADIUS restart error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
