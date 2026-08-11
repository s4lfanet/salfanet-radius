import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const {
      action,
      host,
      username,
      password,
      port = 22,
      vpnServerIp,
      sstpUsername,
      sstpPassword,
    } = await request.json();

    if (!action || !host || !username || !password) {
      return NextResponse.json({
        success: false,
        message: 'Missing required fields: action, host, username, password'
      }, { status: 400 });
    }

    // Validate host and username to prevent shell command injection
    if (!/^[a-zA-Z0-9._-]+$/.test(host)) {
      return NextResponse.json({ success: false, message: 'Invalid host' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      return NextResponse.json({ success: false, message: 'Invalid username' }, { status: 400 });
    }
    const portNum = parseInt(String(port));
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return NextResponse.json({ success: false, message: 'Invalid port' }, { status: 400 });
    }

    let command = '';
    let description = '';

    switch (action) {
      case 'configure':
        if (!vpnServerIp || !sstpUsername || !sstpPassword) {
          return NextResponse.json({
            success: false,
            message: 'Missing SSTP config: vpnServerIp, sstpUsername, sstpPassword required'
          }, { status: 400 });
        }
        command = `
# [1] Pastikan ssl-intercept.so tersedia (perlu install-vpn-client.sh)
if [ ! -f /etc/vpn/ssl-intercept.so ]; then
  APP_DIR=/var/www/salfanet-radius
  if [ -f "$APP_DIR/vps-install/install-vpn-client.sh" ]; then
    echo "[auto-install] Menjalankan install-vpn-client.sh..."
    bash "$APP_DIR/vps-install/install-vpn-client.sh" 2>&1
  else
    echo "ERROR: /etc/vpn/ssl-intercept.so tidak ada."
    echo "Jalankan: bash /var/www/salfanet-radius/vps-install/install-vpn-client.sh"
    exit 1
  fi
fi

# [2] Tulis kredensial ke /etc/vpn/vpn.conf
mkdir -p /etc/vpn
cat > /etc/vpn/vpn.conf << 'VPNEOF'
VPN_SERVER=${vpnServerIp}
VPN_USER=${sstpUsername}
VPN_PASS=${sstpPassword}
VPN_SUBNET=10.20.30.0/24
VPNEOF
chmod 600 /etc/vpn/vpn.conf
echo "[OK] /etc/vpn/vpn.conf ditulis"

# [3] Stop koneksi lama dengan bersih
systemctl stop sstp-vpn 2>/dev/null
sleep 2
systemctl reset-failed sstp-vpn 2>/dev/null

# [4] Jalankan via systemd (pakai LD_PRELOAD ADH shim secara otomatis)
systemctl daemon-reload
systemctl start sstp-vpn && echo "[OK] sstp-vpn service started, tunggu 10 detik..." || { echo "WARN: systemctl start returned error, cek status..."; }
sleep 10

# [5] Enable auto-start saat boot
systemctl enable sstp-vpn 2>/dev/null

# [6] Tampilkan hasil
echo "=== sstp-vpn service status ==="
systemctl status sstp-vpn --no-pager | head -15
echo "=== PPP interface ==="
ip addr show ppp0 2>/dev/null || echo "ppp0 belum aktif (mungkin masih connecting)"
echo "=== Recent logs ==="
journalctl -u sstp-vpn -n 10 --no-pager 2>/dev/null
`;
        description = 'Configuring and connecting SSTP VPN client';
        break;

      case 'start':
        command = 'systemctl reset-failed sstp-vpn 2>/dev/null; systemctl start sstp-vpn; sleep 8; systemctl status sstp-vpn --no-pager | head -10; echo "=PPP="; ip addr show ppp0 2>/dev/null || echo "ppp0: connecting..."';
        description = 'Starting SSTP connection';
        break;

      case 'stop':
        command = 'systemctl stop sstp-vpn; pkill -f sstpc 2>/dev/null; pkill -f pppd 2>/dev/null; sleep 2; echo "SSTP connection stopped"';
        description = 'Stopping SSTP connection';
        break;

      case 'restart':
        command = 'systemctl reset-failed sstp-vpn 2>/dev/null; systemctl restart sstp-vpn; sleep 10; systemctl status sstp-vpn --no-pager | head -10; echo "=PPP="; ip addr show ppp0 2>/dev/null || echo "ppp0: reconnecting..."';
        description = 'Restarting SSTP connection';
        break;

      case 'status':
        command = `
SVC_STATE=$(systemctl is-active sstp-vpn 2>/dev/null)
SSTP_PID=$(pgrep -f sstpc 2>/dev/null | head -1)
PPP_IFACE=$(ip addr show 2>/dev/null | grep -o 'ppp[0-9]*' | head -1)
if [ "$SVC_STATE" = "active" ] || [ -n "$SSTP_PID" ]; then echo "active"; else echo "inactive"; fi
if [ -n "$PPP_IFACE" ]; then
  IP=$(ip addr show $PPP_IFACE 2>/dev/null | grep 'inet ' | awk '{print $2}' | head -1)
  echo "connected:$IP:$PPP_IFACE"
else
  echo "Not connected"
fi
`;
        description = 'Checking SSTP status';
        break;

      case 'logs':
        command = 'journalctl -u sstp-vpn --no-pager -n 40 2>/dev/null; echo "---PPP logs---"; journalctl -t pppd --no-pager -n 20 2>/dev/null; echo "---Process---"; ps aux | grep -E "sstpc|pppd" | grep -v grep | head -10';
        description = 'Fetching SSTP logs';
        break;

      default:
        return NextResponse.json({
          success: false,
          message: 'Invalid action. Supported: configure, start, stop, restart, status, logs'
        }, { status: 400 });
    }

    const passwordBase64 = Buffer.from(password).toString('base64');
    const escapedCommand = command.replace(/'/g, "'\"'\"'");
    // Use SSHPASS env variable (-e flag) so sshpass works correctly in
    // non-interactive/no-tty environments (e.g. PM2 daemon processes)
    const sshCommand = `SSHPASS="$(echo '${passwordBase64}' | base64 -d)" sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -p ${portNum} ${username}@${host} '${escapedCommand}'`;

    console.log('[SSTP Control] Executing action:', action, 'on', `${username}@${host}`);


    try {
      const { stdout, stderr } = await execPromise(sshCommand, {
        timeout: 60000,
        maxBuffer: 1024 * 1024,
        shell: '/bin/bash'
      });

      let parsedResult: any = {
        output: stdout || stderr || 'Command executed',
        rawOutput: stdout,
        rawError: stderr
      };

      if (action === 'status') {
        const lines = stdout.trim().split('\n');
        const statusLine = lines[0]?.trim();
        const connLine = lines[1]?.trim() || '';
        const isConnected = connLine.startsWith('connected:');
        const connParts = connLine.split(':');
        parsedResult = {
          sstp: statusLine === 'active' ? { active: true, status: 'running' } : { active: false, status: 'stopped' },
          connection: isConnected ? `${connParts[1]} (${connParts[2]})` : 'Not connected',
          isRunning: statusLine === 'active'
        };
      } else if (action === 'logs') {
        const logLines = stdout.split('\n').filter((l: string) => l.trim());
        parsedResult.logs = logLines.length > 0 ? logLines : ['No SSTP logs available'];
      }

      return NextResponse.json({
        success: true,
        message: `${description} - Success`,
        action,
        result: parsedResult
      });

    } catch (execError: any) {
      if (execError.message?.includes('Connection refused') || execError.message?.includes('timed out')) {
        return NextResponse.json({ success: false, message: `Cannot connect to ${host}:${port}` }, { status: 500 });
      }
      if (execError.message?.includes('Permission denied') || execError.message?.includes('Authentication failed')) {
        return NextResponse.json({ success: false, message: 'SSH Authentication failed' }, { status: 401 });
      }
      if (execError.message?.includes('sshpass: command not found')) {
        return NextResponse.json({ success: false, message: 'sshpass not installed on server. Run: apt-get install sshpass' }, { status: 500 });
      }
      return NextResponse.json({
        success: false,
        message: `${description} - Failed: ${execError.message}`,
        error: execError.message,
        output: execError.stdout,
        errorOutput: execError.stderr
      }, { status: 500 });
    }

  } catch (error: any) {
    return NextResponse.json({ success: false, message: 'Internal server error', error: error.message }, { status: 500 });
  }
}
