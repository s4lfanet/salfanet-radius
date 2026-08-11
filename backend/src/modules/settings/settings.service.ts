import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

const TIMEZONE_TO_MYSQL_OFFSET: Record<string, string> = {
  'Asia/Jakarta': '+07:00', 'Asia/Makassar': '+08:00', 'Asia/Jayapura': '+09:00',
  'Asia/Singapore': '+08:00', 'Asia/Kuala_Lumpur': '+08:00', 'Asia/Bangkok': '+07:00',
  'Asia/Ho_Chi_Minh': '+07:00', 'Asia/Manila': '+08:00',
  'Asia/Tokyo': '+09:00', 'Asia/Seoul': '+09:00', 'Asia/Hong_Kong': '+08:00',
  'Asia/Shanghai': '+08:00', 'Asia/Taipei': '+08:00',
  'Asia/Dubai': '+04:00', 'Asia/Riyadh': '+03:00',
  'Australia/Sydney': '+11:00', 'Australia/Melbourne': '+11:00', 'Australia/Perth': '+08:00',
  'Pacific/Auckland': '+13:00',
  'Europe/London': '+00:00', 'Europe/Paris': '+01:00', 'Europe/Berlin': '+01:00', 'Europe/Moscow': '+03:00',
  'America/New_York': '-05:00', 'America/Los_Angeles': '-08:00', 'America/Chicago': '-06:00', 'America/Sao_Paulo': '-03:00',
};

const SINGLETON_MAP_ID = 'map-settings-singleton';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== Company Settings (public) ====================

  async getCompanyPublic() {
    const company = await this.prisma.company.findFirst({
      select: { id: true, name: true, logo: true, address: true, phone: true, email: true },
    });
    return {
      success: true,
      company: company || { name: 'SALFANET RADIUS', logo: null, address: null, phone: null, email: null },
    };
  }

  // ==================== Timezone Settings ====================

  private isValidTimezone(timezone: string): boolean {
    if (!timezone || typeof timezone !== 'string') return false;
    if (!(timezone in TIMEZONE_TO_MYSQL_OFFSET)) return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  async updateTimezone(timezone: string, isInternalCall: boolean): Promise<{
    success: boolean; message: string; results: Record<string, unknown>; restartRequired: boolean;
  }> {
    if (!timezone) throw new HttpException('Timezone is required', HttpStatus.BAD_REQUEST);
    if (!this.isValidTimezone(timezone)) throw new HttpException('Invalid timezone', HttpStatus.BAD_REQUEST);

    const results: Record<string, unknown> = { envFile: false, timezoneLib: false, ecosystemConfig: false, errors: [] as string[] };
    const errors: string[] = [];

    // 1. Update .env file
    try {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = await fs.readFile(envPath, 'utf-8');
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
    } catch (error) {
      errors.push(`env file: ${(error as Error).message}`);
    }

    // 2. Update ecosystem.config.js
    try {
      const ecosystemPath = path.join(process.cwd(), 'production', 'ecosystem.config.js');
      let ecosystemContent = await fs.readFile(ecosystemPath, 'utf-8');
      const tzEnvRegex = /TZ:\s*['"].*?['"]/g;
      ecosystemContent = ecosystemContent.replace(tzEnvRegex, `TZ: '${timezone}'`);
      await fs.writeFile(ecosystemPath, ecosystemContent, 'utf-8');
      results.ecosystemConfig = true;
    } catch (error) {
      errors.push(`ecosystem.config.js: ${(error as Error).message}`);
    }

    // 3. Update MySQL timezone (Linux only)
    (results as any).mysqlTimezone = false;
    if (process.platform === 'linux') {
      try {
        const mysqlOffset = TIMEZONE_TO_MYSQL_OFFSET[timezone];
        const mysqlConfigContent = `[mysqld]\ndefault-time-zone = '${mysqlOffset}'\nlog_bin_trust_function_creators = 1\n`;
        const tempConfigPath = `/tmp/salfanet-timezone-${Date.now()}.cnf`;
        await fs.writeFile(tempConfigPath, mysqlConfigContent, 'utf-8');
        await execAsync(`sudo cp ${tempConfigPath} /etc/mysql/mysql.conf.d/timezone.cnf`);
        await fs.unlink(tempConfigPath).catch(() => undefined);

        let dbUser = 'root', dbPassword = '';
        try {
          const dbUrlStr = process.env.DATABASE_URL || '';
          const dbUrl = new URL(dbUrlStr.replace(/^mysql:\/\//, 'http://'));
          dbUser = dbUrl.username || 'root';
          dbPassword = decodeURIComponent(dbUrl.password || '');
        } catch { /* fallback */ }

        const mysqlArgs = dbPassword ? `-u${dbUser} -p${dbPassword}` : `-u${dbUser}`;
        await execAsync(`mysql ${mysqlArgs} -e "SET GLOBAL time_zone = '${mysqlOffset}';"`);
        (results as any).mysqlTimezone = true;
        (results as any).mysqlOffset = mysqlOffset;
      } catch (error) {
        errors.push(`mysql timezone: ${(error as Error).message}`);
      }
    }

    // 4. Update System timezone (Linux only)
    (results as any).systemTimezone = false;
    if (process.platform === 'linux') {
      try {
        await execAsync(`sudo timedatectl set-timezone ${timezone}`);
        (results as any).systemTimezone = true;
      } catch (error) {
        errors.push(`system timezone: ${(error as Error).message}`);
      }
    }

    results.errors = errors;
    const coreSuccess = results.envFile && results.ecosystemConfig;

    if (coreSuccess) {
      const mysqlStatus = (results as any).mysqlTimezone ? ` MySQL timezone set to ${(results as any).mysqlOffset}.` : '';
      const systemStatus = (results as any).systemTimezone ? ' System timezone updated.' : '';
      return {
        success: true,
        message: `Timezone updated to ${timezone}.${mysqlStatus}${systemStatus} Please restart the application.`,
        results: { ...results, mysqlTimezone: (results as any).mysqlTimezone, mysqlOffset: (results as any).mysqlOffset, systemTimezone: (results as any).systemTimezone },
        restartRequired: true,
      };
    } else {
      return { success: false, message: 'Some updates failed', results, restartRequired: false };
    }
  }

  // ==================== Isolation Settings ====================

  async getIsolationSettings() {
    const company = await this.prisma.company.findFirst({
      select: {
        isolationEnabled: true, isolationIpPool: true, isolationServerIp: true,
        isolationRateLimit: true, isolationRedirectUrl: true, isolationMessage: true,
        isolationAllowDns: true, isolationAllowPayment: true, isolationNotifyWhatsapp: true,
        isolationNotifyEmail: true, gracePeriodDays: true, baseUrl: true,
      },
    });
    if (!company) throw new HttpException('Company settings not found', HttpStatus.NOT_FOUND);
    return { success: true, data: company };
  }

  async updateIsolationSettings(body: {
    isolationEnabled?: boolean; isolationIpPool?: string; isolationServerIp?: string;
    isolationRateLimit?: string; isolationRedirectUrl?: string; isolationMessage?: string;
    isolationAllowDns?: boolean; isolationAllowPayment?: boolean;
    isolationNotifyWhatsapp?: boolean; isolationNotifyEmail?: boolean; gracePeriodDays?: number;
  }) {
    const { isolationIpPool, isolationServerIp, isolationRateLimit } = body;

    if (isolationIpPool && !isolationIpPool.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/)) {
      throw new HttpException('Invalid IP pool format. Use CIDR notation (e.g., 192.168.200.0/24)', HttpStatus.BAD_REQUEST);
    }
    if (isolationServerIp && !isolationServerIp.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      throw new HttpException('Invalid server IP format', HttpStatus.BAD_REQUEST);
    }
    if (isolationRateLimit && !isolationRateLimit.match(/^\d+[kmg]?\/\d+[kmg]?$/i)) {
      throw new HttpException('Invalid rate limit format. Use format like: 64k/64k, 1M/1M', HttpStatus.BAD_REQUEST);
    }

    const company = await this.prisma.company.findFirst();
    if (!company) throw new HttpException('Company not found', HttpStatus.NOT_FOUND);

    const updated = await this.prisma.company.update({
      where: { id: company.id },
      data: {
        isolationEnabled: body.isolationEnabled ?? company.isolationEnabled,
        isolationIpPool: body.isolationIpPool ?? company.isolationIpPool,
        isolationServerIp: body.isolationServerIp !== undefined ? (body.isolationServerIp || null) : company.isolationServerIp,
        isolationRateLimit: body.isolationRateLimit ?? company.isolationRateLimit,
        isolationRedirectUrl: body.isolationRedirectUrl ?? company.isolationRedirectUrl,
        isolationMessage: body.isolationMessage ?? company.isolationMessage,
        isolationAllowDns: body.isolationAllowDns ?? company.isolationAllowDns,
        isolationAllowPayment: body.isolationAllowPayment ?? company.isolationAllowPayment,
        isolationNotifyWhatsapp: body.isolationNotifyWhatsapp ?? company.isolationNotifyWhatsapp,
        isolationNotifyEmail: body.isolationNotifyEmail ?? company.isolationNotifyEmail,
        gracePeriodDays: body.gracePeriodDays ?? company.gracePeriodDays,
      },
    });

    // Update radgroupreply for isolir group
    const rateLimit = body.isolationRateLimit ?? company.isolationRateLimit ?? '64k/64k';
    await this.prisma.$executeRaw`DELETE FROM radgroupreply WHERE groupname = 'isolir' AND attribute = 'Mikrotik-Rate-Limit'`;
    await this.prisma.$executeRaw`INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ('isolir', 'Mikrotik-Rate-Limit', ':=', ${rateLimit})`;
    await this.prisma.$executeRaw`DELETE FROM radgroupreply WHERE groupname = 'isolir' AND attribute = 'Mikrotik-Group'`;
    await this.prisma.$executeRaw`INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ('isolir', 'Mikrotik-Group', ':=', 'isolir')`;
    const ipPool = body.isolationIpPool ?? company.isolationIpPool ?? '192.168.200.0/24';
    await this.prisma.$executeRaw`DELETE FROM radgroupreply WHERE groupname = 'isolir' AND attribute = 'Framed-Pool'`;
    await this.prisma.$executeRaw`INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ('isolir', 'Framed-Pool', ':=', 'pool-isolir')`;
    await this.prisma.$executeRaw`DELETE FROM radgroupreply WHERE groupname = 'isolir' AND attribute = 'Mikrotik-Address-List'`;
    await this.prisma.$executeRaw`INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ('isolir', 'Mikrotik-Address-List', ':=', 'isolir')`;

    // Sync VPS kernel route (Linux only, fire-and-forget)
    if (process.platform === 'linux' && ipPool) {
      this.syncIsolationRouteOnVps(company.isolationIpPool ?? null, ipPool).catch((err) => {
        this.logger.error('VPS route sync failed (non-fatal):', err);
      });
    }

    return { success: true, message: 'Isolation settings updated successfully', data: updated };
  }

  private async syncIsolationRouteOnVps(oldPool: string | null, newPool: string): Promise<void> {
    if (process.platform !== 'linux' || !newPool) return;
    try {
      const { stdout } = await execAsync('ip route show dev ppp0 2>/dev/null');
      const peerIp = stdout.trim().split('\n')[0]?.split(' ')[0] ?? '';
      if (!peerIp.match(/^\d+\.\d+\.\d+\.\d+$/)) return;

      if (oldPool && oldPool !== newPool) {
        await execAsync(`ip route del ${oldPool} dev ppp0 2>/dev/null || true`);
        await execAsync(`iptables -D INPUT -s ${oldPool} -p tcp --dport 80 -j ACCEPT 2>/dev/null || true`);
      }
      await execAsync(`ip route replace ${newPool} via ${peerIp} dev ppp0 metric 100`);
      await execAsync(`iptables -C INPUT -s ${newPool} -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT -s ${newPool} -p tcp --dport 80 -j ACCEPT`);

      const vpnConfPath = '/etc/vpn/vpn.conf';
      let existing = '';
      try { existing = await fs.readFile(vpnConfPath, 'utf8'); } catch { /* file may not exist */ }
      const updated = existing.split('\n').filter((l) => !l.startsWith('ISOLATION_POOL=')).concat([`ISOLATION_POOL=${newPool}`]).join('\n').replace(/^\n+/, '');
      await fs.mkdir('/etc/vpn', { recursive: true });
      await fs.writeFile(vpnConfPath, updated, 'utf8');
      this.logger.log(`[Isolation Route] Synced: ${newPool} via ${peerIp} (ppp0)`);
    } catch (err) {
      this.logger.error('[Isolation Route] Failed:', err);
    }
  }

  // ==================== Map Settings ====================

  async getMapSettings() {
    let settings = await this.prisma.mapSettings.findFirst();
    if (!settings) {
      settings = await this.prisma.mapSettings.create({
        data: {
          id: SINGLETON_MAP_ID,
          defaultLat: -7.071273611475302,
          defaultLon: 108.04475042198051,
          defaultZoom: 13,
          mapTheme: 'default',
          osrmApiUrl: 'http://router.project-osrm.org',
          followRoad: false,
        },
      });
    }
    return { settings };
  }

  async updateMapSettings(body: {
    defaultLat: number | string; defaultLon: number | string; defaultZoom: number | string;
    mapTheme?: string; osrmApiUrl?: string; followRoad?: boolean;
  }) {
    const lat = parseFloat(String(body.defaultLat));
    const lon = parseFloat(String(body.defaultLon));
    const zoom = parseInt(String(body.defaultZoom), 10);

    if (isNaN(lat) || lat < -90 || lat > 90) throw new HttpException('Latitude tidak valid (-90 s/d 90)', HttpStatus.BAD_REQUEST);
    if (isNaN(lon) || lon < -180 || lon > 180) throw new HttpException('Longitude tidak valid (-180 s/d 180)', HttpStatus.BAD_REQUEST);
    if (isNaN(zoom) || zoom < 1 || zoom > 20) throw new HttpException('Zoom tidak valid (1-20)', HttpStatus.BAD_REQUEST);

    const existing = await this.prisma.mapSettings.findFirst();
    const data = {
      defaultLat: lat, defaultLon: lon, defaultZoom: zoom,
      mapTheme: body.mapTheme || 'default',
      osrmApiUrl: body.osrmApiUrl || 'http://router.project-osrm.org',
      followRoad: Boolean(body.followRoad),
    };
    const settings = existing
      ? await this.prisma.mapSettings.update({ where: { id: existing.id }, data })
      : await this.prisma.mapSettings.create({ data: { id: SINGLETON_MAP_ID, ...data } });
    return { settings };
  }

  // ==================== Restart Services ====================

  async getRestartServicesStatus() {
    const isLinux = process.platform === 'linux';
    const isDev = process.env.NODE_ENV === 'development';
    return { platform: process.platform, isLinux, isDev, autoRestartAvailable: isLinux };
  }

  async restartServices(services: string, delay: number = 3000) {
    const validServices = ['pm2', 'freeradius', 'all'];
    if (!services || !validServices.includes(services)) {
      throw new HttpException('Invalid services parameter. Use: pm2, freeradius, or all', HttpStatus.BAD_REQUEST);
    }

    const isLinux = process.platform === 'linux';
    const isDev = process.env.NODE_ENV === 'development';

    if (!isLinux) {
      return {
        success: true,
        message: isDev
          ? 'Development mode: Changes applied to frontend immediately.'
          : 'Non-Linux platform: Please restart services manually.',
        platform: process.platform, isDev, autoRestarted: false,
        note: isDev ? 'Untuk perubahan server-side, restart dev server' : 'Run: pm2 restart all && sudo systemctl restart freeradius',
      };
    }

    const commands: string[] = [];
    if (services === 'pm2' || services === 'all') commands.push('pm2 restart all --update-env');
    if (services === 'freeradius' || services === 'all') commands.push('sudo systemctl restart freeradius');

    setTimeout(async () => {
      for (const cmd of commands) {
        try {
          this.logger.log(`Executing: ${cmd}`);
          await execAsync(cmd);
          this.logger.log(`Success: ${cmd}`);
        } catch (error) {
          this.logger.error(`Error executing ${cmd}:`, (error as Error).message);
        }
      }
    }, delay);

    return {
      success: true,
      message: `Services will restart in ${delay / 1000} seconds`,
      services: commands, delay, autoRestarted: true,
    };
  }
}
