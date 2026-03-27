import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Timezone to MySQL offset mapping
 * This ensures MySQL timezone matches the configured timezone
 */
const TIMEZONE_TO_MYSQL_OFFSET: Record<string, string> = {
  // Indonesia
  'Asia/Jakarta': '+07:00',      // WIB
  'Asia/Makassar': '+08:00',     // WITA
  'Asia/Jayapura': '+09:00',     // WIT
  
  // Southeast Asia
  'Asia/Singapore': '+08:00',
  'Asia/Kuala_Lumpur': '+08:00',
  'Asia/Bangkok': '+07:00',
  'Asia/Ho_Chi_Minh': '+07:00',
  'Asia/Manila': '+08:00',
  
  // East Asia
  'Asia/Tokyo': '+09:00',
  'Asia/Seoul': '+09:00',
  'Asia/Hong_Kong': '+08:00',
  'Asia/Shanghai': '+08:00',
  'Asia/Taipei': '+08:00',
  
  // Middle East
  'Asia/Dubai': '+04:00',
  'Asia/Riyadh': '+03:00',
  
  // Australia & Pacific
  'Australia/Sydney': '+11:00',   // AEDT (summer)
  'Australia/Melbourne': '+11:00',
  'Australia/Perth': '+08:00',
  'Pacific/Auckland': '+13:00',   // NZDT (summer)
  
  // Europe
  'Europe/London': '+00:00',
  'Europe/Paris': '+01:00',
  'Europe/Berlin': '+01:00',
  'Europe/Moscow': '+03:00',
  
  // Americas
  'America/New_York': '-05:00',
  'America/Los_Angeles': '-08:00',
  'America/Chicago': '-06:00',
  'America/Sao_Paulo': '-03:00',
};

/**
 * Get MySQL offset for a timezone
 */
function getMySQLOffset(timezone: string): string {
  return TIMEZONE_TO_MYSQL_OFFSET[timezone] || '+00:00';
}

function isValidTimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== 'string') return false;
  if (!(timezone in TIMEZONE_TO_MYSQL_OFFSET)) return false;

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check if this is an internal call (from company API) or external
    const isInternalCall = req.headers.get('x-internal-call') === 'true';
    
    if (!isInternalCall) {
      const session = await getServerSession(authOptions);
      if (!session || session.user.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { timezone } = await req.json();

    if (!timezone) {
      return NextResponse.json({ error: 'Timezone is required' }, { status: 400 });
    }

    if (!isValidTimezone(timezone)) {
      return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
    }

    const results = {
      envFile: false,
      timezoneLib: false,
      ecosystemConfig: false,
      errors: [] as string[],
    };

    // 1. Update .env file
    try {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = await fs.readFile(envPath, 'utf-8');
      
      // Update or add TZ and NEXT_PUBLIC_TIMEZONE
      const tzRegex = /^TZ=.*$/m;
      const nextPublicTzRegex = /^NEXT_PUBLIC_TIMEZONE=.*$/m;
      
      if (tzRegex.test(envContent)) {
        envContent = envContent.replace(tzRegex, `TZ="${timezone}"`);
      } else {
        envContent += `\nTZ="${timezone}"`;
      }
      
      if (nextPublicTzRegex.test(envContent)) {
        envContent = envContent.replace(nextPublicTzRegex, `NEXT_PUBLIC_TIMEZONE="${timezone}"`);
      } else {
        envContent += `\nNEXT_PUBLIC_TIMEZONE="${timezone}"`;
      }
      
      await fs.writeFile(envPath, envContent, 'utf-8');
      results.envFile = true;
    } catch (error: any) {
      results.errors.push(`env file: ${error.message}`);
    }

    // 2. Update src/lib/timezone.ts
    try {
      const timezonePath = path.join(process.cwd(), 'src', 'lib', 'timezone.ts');
      let timezoneContent = await fs.readFile(timezonePath, 'utf-8');
      
      // Update WIB_TIMEZONE constant (keep name as WIB_TIMEZONE for backward compatibility)
      const wibTimezoneRegex = /export const WIB_TIMEZONE = ['"].*?['"];/;
      timezoneContent = timezoneContent.replace(
        wibTimezoneRegex,
        `export const WIB_TIMEZONE = '${timezone}';`
      );
      
      // Update LOCAL_TIMEZONE if exists
      const localTimezoneRegex = /export const LOCAL_TIMEZONE = ['"].*?['"];/;
      if (localTimezoneRegex.test(timezoneContent)) {
        timezoneContent = timezoneContent.replace(
          localTimezoneRegex,
          `export const LOCAL_TIMEZONE = '${timezone}';`
        );
      }
      
      await fs.writeFile(timezonePath, timezoneContent, 'utf-8');
      results.timezoneLib = true;
    } catch (error: any) {
      results.errors.push(`timezone.ts: ${error.message}`);
    }

    // 3. Update ecosystem.config.js
    try {
      const ecosystemPath = path.join(process.cwd(), 'production', 'ecosystem.config.js');
      let ecosystemContent = await fs.readFile(ecosystemPath, 'utf-8');
      
      // Update TZ in env object
      const tzEnvRegex = /TZ:\s*['"].*?['"]/g;
      ecosystemContent = ecosystemContent.replace(tzEnvRegex, `TZ: '${timezone}'`);
      
      await fs.writeFile(ecosystemPath, ecosystemContent, 'utf-8');
      results.ecosystemConfig = true;
    } catch (error: any) {
      results.errors.push(`ecosystem.config.js: ${error.message}`);
    }

    // 4. Update MySQL timezone (Linux only)
    // This ensures MySQL datetime functions like NOW() return correct local time
    (results as any).mysqlTimezone = false;
    if (process.platform === 'linux') {
      try {
        const mysqlOffset = getMySQLOffset(timezone);
        
        // Create persistent MySQL timezone config
        const mysqlConfigContent = `[mysqld]
default-time-zone = '${mysqlOffset}'
log_bin_trust_function_creators = 1
`;
        
        // Write config through temp file to avoid shell interpolation.
        const tempConfigPath = `/tmp/salfanet-timezone-${Date.now()}.cnf`;
        await fs.writeFile(tempConfigPath, mysqlConfigContent, 'utf-8');
        await execFileAsync('sudo', ['cp', tempConfigPath, '/etc/mysql/mysql.conf.d/timezone.cnf']);
        await fs.unlink(tempConfigPath).catch(() => undefined);
        
        // Get MySQL credentials from environment
        const dbUser = process.env.DATABASE_USER || 'salfanet_user';
        const dbPassword = process.env.DATABASE_PASSWORD || 'salfanetradius123';
        
        // Set timezone immediately without restart
        await execFileAsync('mysql', [
          `-u${dbUser}`,
          `-p${dbPassword}`,
          '-e',
          `SET GLOBAL time_zone = '${mysqlOffset}';`
        ]);
        
        (results as any).mysqlTimezone = true;
        (results as any).mysqlOffset = mysqlOffset;
      } catch (error: any) {
        results.errors.push(`mysql timezone: ${error.message}`);
      }
    }

    // 5. Update System timezone (Linux only)
    // This ensures system time matches the configured timezone
    (results as any).systemTimezone = false;
    if (process.platform === 'linux') {
      try {
        // Set system timezone using timedatectl
        await execFileAsync('sudo', ['timedatectl', 'set-timezone', timezone]);
        (results as any).systemTimezone = true;
      } catch (error: any) {
        results.errors.push(`system timezone: ${error.message}`);
      }
    }

    // Check if core updates were successful (MySQL and system timezone are optional on non-Linux)
    const coreSuccess = results.envFile && results.timezoneLib && results.ecosystemConfig;

    if (coreSuccess) {
      const mysqlStatus = (results as any).mysqlTimezone ? 
        ` MySQL timezone set to ${(results as any).mysqlOffset}.` : '';
      const systemStatus = (results as any).systemTimezone ? 
        ' System timezone updated.' : '';
      
      return NextResponse.json({
        success: true,
        message: `Timezone updated to ${timezone}.${mysqlStatus}${systemStatus} Please restart the application.`,
        results: {
          ...results,
          mysqlTimezone: (results as any).mysqlTimezone,
          mysqlOffset: (results as any).mysqlOffset,
          systemTimezone: (results as any).systemTimezone,
        },
        restartRequired: true,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'Some updates failed',
        results,
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Timezone update error:', error);
    return NextResponse.json(
      { error: 'Failed to update timezone', details: error.message },
      { status: 500 }
    );
  }
}
