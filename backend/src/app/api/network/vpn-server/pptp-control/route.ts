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
      pptpUsername,
      pptpPassword,
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
        if (!vpnServerIp || !pptpUsername || !pptpPassword) {
          return NextResponse.json({
            success: false,
            message: 'Missing PPTP config: vpnServerIp, pptpUsername, pptpPassword required'
          }, { status: 400 });
        }
        command = `
# Install pptp-linux if not installed
if ! command -v pptp &>/dev/null; then
  sudo apt-get install -y pptp-linux || echo "Failed to install pptp-linux"
fi &&

# Load PPP modules
sudo modprobe ppp_generic 2>/dev/null || true &&
sudo modprobe ppp_mppe 2>/dev/null || true &&

# Create peer config
sudo bash -c "cat > /etc/ppp/peers/vpn-pptp << 'EOF'
pty "pptp ${vpnServerIp} --nolaunchpppd"
name ${pptpUsername}
remotename PPTP
require-mppe-128
file /etc/ppp/options.pptp
ipparam vpn
EOF
" &&

# Write credentials
sudo bash -c "grep -v '${pptpUsername}' /etc/ppp/chap-secrets > /tmp/chap-tmp 2>/dev/null; mv /tmp/chap-tmp /etc/ppp/chap-secrets 2>/dev/null; echo '${pptpUsername} PPTP ${pptpPassword} *' >> /etc/ppp/chap-secrets" &&
sudo chmod 600 /etc/ppp/chap-secrets &&

# PPP options for PPTP
sudo bash -c "cat > /etc/ppp/options.pptp << 'EOF'
lock
noauth
nobsdcomp
nodeflate
noipdefaultroute
EOF
" &&

# Disconnect existing first
sudo pkill -f 'pptp ${vpnServerIp}' 2>/dev/null || true &&
sleep 1 &&

# Connect
sudo pppd call vpn-pptp &
sleep 8 &&

echo "=== PPTP Status ===" &&
ip addr show | grep -A3 "ppp" || echo "No PPP interface up yet" &&
ip route show | grep ppp | head -5 || echo "No PPP routes" &&
echo "Check: sudo journalctl -f for pppd logs"
`;
        description = 'Configuring and connecting PPTP VPN client';
        break;

      case 'start':
        command = 'sudo pkill -f "pptp" 2>/dev/null || true; sleep 1; sudo pppd call vpn-pptp & sleep 5; ip addr show | grep -A2 "ppp.*UP" || echo "PPTP connecting..."; echo "PPTP start initiated"';
        description = 'Starting PPTP connection';
        break;

      case 'stop':
        command = 'sudo pkill -f "pptp" 2>/dev/null; sudo pkill -f "pppd call vpn-pptp" 2>/dev/null; sleep 2; echo "PPTP connection stopped"';
        description = 'Stopping PPTP connection';
        break;

      case 'restart':
        command = 'sudo pkill -f "pptp" 2>/dev/null || true; sleep 2; sudo pppd call vpn-pptp & sleep 5; ip addr show | grep -A2 "ppp.*UP" || echo "PPTP reconnecting..."; echo "PPTP restarted"';
        description = 'Restarting PPTP connection';
        break;

      case 'status':
        command = `
PPTP_PID=$(pgrep -f "pptp" 2>/dev/null | head -1)
PPP_IFACE=$(ip addr show | grep -B1 "peer.*\/32" | grep -o "ppp[0-9]*" | head -1)
if [ -n "$PPTP_PID" ]; then echo "active"; else echo "inactive"; fi
if [ -n "$PPP_IFACE" ]; then
  IP=$(ip addr show $PPP_IFACE 2>/dev/null | grep "inet " | awk '{print $2}' | head -1)
  echo "connected:$IP:$PPP_IFACE"
else
  echo "Not connected"
fi
`;
        description = 'Checking PPTP status';
        break;

      case 'logs':
        command = 'sudo journalctl _COMM=pppd --no-pager -n 50 2>/dev/null; echo "---PPTP Process---"; ps aux | grep -E "pptp|pppd" | grep -v grep | head -10';
        description = 'Fetching PPTP logs';
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

    console.log('[PPTP Control] Executing action:', action, 'on', `${username}@${host}`);

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
          pptp: statusLine === 'active' ? { active: true, status: 'running' } : { active: false, status: 'stopped' },
          connection: isConnected ? `${connParts[1]} (${connParts[2]})` : 'Not connected',
          isRunning: statusLine === 'active'
        };
      } else if (action === 'logs') {
        const logLines = stdout.split('\n').filter((l: string) => l.trim());
        parsedResult.logs = logLines.length > 0 ? logLines : ['No PPTP logs available'];
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
