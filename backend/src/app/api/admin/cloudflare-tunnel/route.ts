import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * GET /api/admin/cloudflare-tunnel
 * Returns current tunnel config + cloudflared service status
 */
export async function GET() {
  try {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;
    const session = authCheck.session;

    const company = await prisma.company.findFirst();

    // Check cloudflared installed
    let cloudflaredInstalled = false;
    let cloudflaredVersion = '';
    try {
      const { stdout } = await execAsync('cloudflared --version 2>&1');
      cloudflaredInstalled = true;
      cloudflaredVersion = stdout.trim();
    } catch {
      cloudflaredInstalled = false;
    }

    // Check service status
    let serviceStatus: 'active' | 'inactive' | 'failed' | 'not-installed' = 'not-installed';
    let serviceEnabled = false;
    let connections = 0;
    let tunnelConfig: any = null;

    if (cloudflaredInstalled) {
      try {
        const { stdout: statusOut } = await execAsync('systemctl is-active cloudflared 2>&1');
        const status = statusOut.trim();
        if (status === 'active') serviceStatus = 'active';
        else if (status === 'inactive') serviceStatus = 'inactive';
        else if (status === 'failed') serviceStatus = 'failed';
      } catch {
        // systemctl is-active returns non-zero if not active
        try {
          const { stdout } = await execAsync('systemctl is-active cloudflared 2>&1');
          const status = stdout.trim();
          if (status === 'active') serviceStatus = 'active';
          else if (status === 'inactive') serviceStatus = 'inactive';
          else if (status === 'failed') serviceStatus = 'failed';
          else serviceStatus = 'inactive';
        } catch {
          serviceStatus = 'inactive';
        }
      }

      try {
        const { stdout } = await execAsync('systemctl is-enabled cloudflared 2>&1');
        serviceEnabled = stdout.trim() === 'enabled';
      } catch {
        serviceEnabled = false;
      }

      // Count tunnel connections from logs
      if (serviceStatus === 'active') {
        try {
          const { stdout } = await execAsync('journalctl -u cloudflared --no-pager -n 50 2>&1 | grep -c "Registered tunnel connection"');
          connections = parseInt(stdout.trim()) || 0;
        } catch {
          connections = 0;
        }
      }

      // Read tunnel config (token-based)
      try {
        const tokenFile = '/etc/cloudflared/token';
        if (existsSync(tokenFile)) {
          const token = (await readFile(tokenFile, 'utf-8')).trim();
          tunnelConfig = { hasToken: true, tokenPreview: token.substring(0, 20) + '...' };
        }
      } catch {
        // ignore
      }
    }

    // Check nginx port
    let nginxPort = '';
    try {
      const { stdout } = await execAsync("grep -m1 'listen ' /etc/nginx/sites-available/salfanet 2>/dev/null || grep -m1 'listen ' /etc/nginx/sites-enabled/default 2>/dev/null");
      const match = stdout.match(/listen\s+(\d+)/);
      nginxPort = match ? match[1] : '80';
    } catch {
      nginxPort = '80';
    }

    return NextResponse.json({
      baseUrl: company?.baseUrl || '',
      envNextauthUrl: process.env.NEXTAUTH_URL || '',
      envAppUrl: process.env.NEXT_PUBLIC_APP_URL || '',
      cloudflared: {
        installed: cloudflaredInstalled,
        version: cloudflaredVersion,
        serviceStatus,
        serviceEnabled,
        connections,
        tunnelConfig,
      },
      nginx: {
        port: nginxPort,
      },
    });
  } catch (error) {
    console.error('CF tunnel GET error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

/**
 * POST /api/admin/cloudflare-tunnel
 * Actions: save_config | install | start | stop | restart | enable | disable
 */
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requirePermission('settings.edit');
    if (!authCheck.authorized) return authCheck.response;
    const session = authCheck.session;

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'save_config': {
        const { tunnelDomain, tunnelToken, localPort } = body;
        if (!tunnelDomain || typeof tunnelDomain !== 'string') {
          return NextResponse.json({ error: 'tunnelDomain is required' }, { status: 400 });
        }

        // Normalize domain
        let baseUrl = tunnelDomain.trim();
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
          baseUrl = `https://${baseUrl}`;
        }
        baseUrl = baseUrl.replace(/\/$/, '');

        const company = await prisma.company.findFirst();
        if (!company) {
          return NextResponse.json({ error: 'Company settings not found' }, { status: 404 });
        }

        await prisma.company.update({
          where: { id: company.id },
          data: { baseUrl },
        });

        // Update NEXTAUTH_URL in .env files
        const envPaths = [
          '/var/www/salfanet-radius/backend/.env',
          '/var/www/salfanet-radius/frontend/.env',
          '/var/www/salfanet-radius/backend/.next/standalone/backend/.env',
          '/var/www/salfanet-radius/frontend/.next/standalone/frontend/.env',
        ];

        for (const envPath of envPaths) {
          try {
            if (existsSync(envPath)) {
              let content = await readFile(envPath, 'utf-8');
              content = content.replace(/NEXTAUTH_URL=.*/g, `NEXTAUTH_URL="${baseUrl}"`);
              if (!content.includes('NEXTAUTH_URL=')) {
                content += `\nNEXTAUTH_URL="${baseUrl}"\n`;
              }
              await writeFile(envPath, content, 'utf-8');
            }
          } catch {
            // ignore file errors
          }
        }

        // Save tunnel token if provided
        if (tunnelToken && typeof tunnelToken === 'string' && tunnelToken.trim()) {
          try {
            await mkdir('/etc/cloudflared', { recursive: true });
            await writeFile('/etc/cloudflared/token', tunnelToken.trim(), 'utf-8');
          } catch (err: any) {
            console.error('Failed to save tunnel token:', err.message);
          }
        }

        return NextResponse.json({
          success: true,
          baseUrl,
          message: 'Domain dan token tunnel berhasil disimpan. NEXTAUTH_URL di-update di semua .env',
        });
      }

      case 'install': {
        try {
          // Install cloudflared via apt
          const commands = [
            'mkdir -p --mode=0755 /usr/share/keyrings',
            'curl -fsSL https://pkg.cloudflare.com/cloudflare-public-v2.gpg -o /usr/share/keyrings/cloudflare-public-v2.gpg',
            `echo 'deb [signed-by=/usr/share/keyrings/cloudflare-public-v2.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list`,
            'apt-get update -qq',
            'DEBIAN_FRONTEND=noninteractive apt-get install -y cloudflared',
          ];

          const { stdout, stderr } = await execAsync(commands.join(' && '), { timeout: 120000 });
          const versionOut = await execAsync('cloudflared --version 2>&1');

          return NextResponse.json({
            success: true,
            message: 'cloudflared berhasil diinstall',
            version: versionOut.stdout.trim(),
          });
        } catch (err: any) {
          return NextResponse.json({
            error: 'Gagal install cloudflared',
            detail: err.message,
          }, { status: 500 });
        }
      }

      case 'start': {
        try {
          await execAsync('systemctl start cloudflared 2>&1');
          return NextResponse.json({ success: true, message: 'Cloudflared service started' });
        } catch (err: any) {
          return NextResponse.json({
            error: 'Gagal start cloudflared',
            detail: err.message,
          }, { status: 500 });
        }
      }

      case 'stop': {
        try {
          await execAsync('systemctl stop cloudflared 2>&1');
          return NextResponse.json({ success: true, message: 'Cloudflared service stopped' });
        } catch (err: any) {
          return NextResponse.json({
            error: 'Gagal stop cloudflared',
            detail: err.message,
          }, { status: 500 });
        }
      }

      case 'restart': {
        try {
          await execAsync('systemctl restart cloudflared 2>&1');
          return NextResponse.json({ success: true, message: 'Cloudflared service restarted' });
        } catch (err: any) {
          return NextResponse.json({
            error: 'Gagal restart cloudflared',
            detail: err.message,
          }, { status: 500 });
        }
      }

      case 'enable': {
        try {
          await execAsync('systemctl enable cloudflared 2>&1');
          return NextResponse.json({ success: true, message: 'Cloudflared auto-start enabled' });
        } catch (err: any) {
          return NextResponse.json({
            error: 'Gagal enable cloudflared',
            detail: err.message,
          }, { status: 500 });
        }
      }

      case 'disable': {
        try {
          await execAsync('systemctl disable cloudflared 2>&1');
          return NextResponse.json({ success: true, message: 'Cloudflared auto-start disabled' });
        } catch (err: any) {
          return NextResponse.json({
            error: 'Gagal disable cloudflared',
            detail: err.message,
          }, { status: 500 });
        }
      }

      case 'install_service': {
        // Install cloudflared as systemd service with token
        const { tunnelToken } = body;
        if (!tunnelToken || typeof tunnelToken !== 'string') {
          return NextResponse.json({ error: 'tunnelToken is required' }, { status: 400 });
        }

        try {
          await execAsync(`cloudflared service install ${tunnelToken.trim()} 2>&1`, { timeout: 30000 });
          await execAsync('systemctl enable cloudflared 2>&1');

          return NextResponse.json({
            success: true,
            message: 'Cloudflared service installed dengan token. Service akan auto-start on boot.',
          });
        } catch (err: any) {
          return NextResponse.json({
            error: 'Gagal install service cloudflared',
            detail: err.message,
          }, { status: 500 });
        }
      }

      case 'switch_nginx_port': {
        // Switch nginx from port 80 to 8080 (or vice versa)
        const { port } = body;
        if (!port || (port !== '80' && port !== '8080')) {
          return NextResponse.json({ error: 'port must be 80 or 8080' }, { status: 400 });
        }

        try {
          const nginxFile = '/etc/nginx/sites-available/salfanet';
          let content = await readFile(nginxFile, 'utf-8');
          content = content.replace(/listen\s+\d+;/g, `listen ${port};`);
          await writeFile(nginxFile, content, 'utf-8');
          await execAsync('nginx -t 2>&1 && systemctl reload nginx 2>&1');

          return NextResponse.json({
            success: true,
            message: `Nginx switched to port ${port}`,
          });
        } catch (err: any) {
          return NextResponse.json({
            error: 'Gagal switch nginx port',
            detail: err.message,
          }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('CF tunnel POST error:', error);
    return NextResponse.json({ error: 'Failed to process request', detail: error.message }, { status: 500 });
  }
}
