import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';

const execAsync = promisify(exec);

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        // Check if FreeRADIUS is running
        let running = false;
        let pid: number | null = null;
        let uptime = '';
        let cpu = 0;
        let memory = 0;
        let memoryMB = 0;
        let version = '';
        let startTime = '';

        // Try to get FreeRADIUS process info
        try {
            // Check systemctl status
            const { stdout: statusOutput } = await execAsync('systemctl is-active freeradius 2>/dev/null || echo inactive');
            running = statusOutput.trim() === 'active';

            if (running) {
                // Get PID
                try {
                    const { stdout: pidOutput } = await execAsync('pgrep -x freeradius 2>/dev/null || pgrep radiusd 2>/dev/null');
                    pid = parseInt(pidOutput.trim().split('\n')[0], 10) || null;
                } catch {
                    // Try alternative method
                    try {
                        const { stdout: pidOutput2 } = await execAsync('cat /var/run/freeradius/freeradius.pid 2>/dev/null || cat /var/run/radiusd/radiusd.pid 2>/dev/null');
                        pid = parseInt(pidOutput2.trim(), 10) || null;
                    } catch { }
                }

                // Get process stats if we have PID
                if (pid) {
                    try {
                        const { stdout: psOutput } = await execAsync(`ps -p ${pid} -o %cpu,%mem --no-headers 2>/dev/null`);
                        const parts = psOutput.trim().split(/\s+/);
                        if (parts.length >= 2) {
                            cpu = parseFloat(parts[0]) || 0;
                            memory = parseFloat(parts[1]) || 0;
                        }
                    } catch { }

                    // Get memory in MB
                    try {
                        const { stdout: memOutput } = await execAsync(`ps -p ${pid} -o rss --no-headers 2>/dev/null`);
                        memoryMB = (parseInt(memOutput.trim(), 10) || 0) / 1024;
                    } catch { }

                    // Get start time and calculate uptime from systemctl
                    try {
                        const { stdout: activeTimeOutput } = await execAsync('systemctl show freeradius -p ActiveEnterTimestamp --value 2>/dev/null');
                        const activeTime = activeTimeOutput.trim();
                        
                        if (activeTime && activeTime !== 'n/a') {
                            // Remove non-standard timezone abbreviation (e.g. "WIB") before parsing
                            const cleanedTime = activeTime.replace(/\s+[A-Z]{2,5}$/, '');
                            
                            // Parse the timestamp
                            startTime = new Date(cleanedTime).toISOString();
                            
                            // Calculate uptime
                            const startMs = new Date(cleanedTime).getTime();
                            const nowMs = Date.now();
                            const uptimeSeconds = Math.floor((nowMs - startMs) / 1000);
                            
                            // Format uptime as HH:MM:SS or DD-HH:MM:SS
                            const days = Math.floor(uptimeSeconds / 86400);
                            const hours = Math.floor((uptimeSeconds % 86400) / 3600);
                            const minutes = Math.floor((uptimeSeconds % 3600) / 60);
                            const seconds = uptimeSeconds % 60;
                            
                            if (days > 0) {
                                uptime = `${days}-${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                            } else {
                                uptime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                            }
                        }
                    } catch (err) {
                        console.error('Error getting start time from systemctl:', err);
                        // Fallback to ps method
                        try {
                            const { stdout: startOutput } = await execAsync(`ps -p ${pid} -o lstart --no-headers 2>/dev/null`);
                            startTime = new Date(startOutput.trim()).toISOString();
                            
                            // Calculate uptime manually
                            const startMs = new Date(startOutput.trim()).getTime();
                            const nowMs = Date.now();
                            const uptimeSeconds = Math.floor((nowMs - startMs) / 1000);
                            
                            const days = Math.floor(uptimeSeconds / 86400);
                            const hours = Math.floor((uptimeSeconds % 86400) / 3600);
                            const minutes = Math.floor((uptimeSeconds % 3600) / 60);
                            const seconds = uptimeSeconds % 60;
                            
                            if (days > 0) {
                                uptime = `${days}-${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                            } else {
                                uptime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                            }
                        } catch { }
                    }
                }
            }

            // Get FreeRADIUS version
            try {
                const { stdout: versionOutput } = await execAsync('freeradius -v 2>/dev/null || radiusd -v 2>/dev/null');
                const versionMatch = versionOutput.match(/FreeRADIUS Version\s+([\d.]+)/i) ||
                    versionOutput.match(/Version\s+([\d.]+)/i);
                if (versionMatch) {
                    version = versionMatch[1];
                }
            } catch { }

        } catch (error) {
            console.error('Error checking FreeRADIUS status:', error);
        }

        // Get active session count and request stats from radacct database
        let activeConnections = 0;
        let totalAuthRequests = 0;
        let totalAcctRequests = 0;

        try {
            // Active connections = sessions with no stop time in radacct
            const activeResult = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
                SELECT COUNT(*) as cnt FROM radacct WHERE acctstoptime IS NULL
            `;
            activeConnections = Number(activeResult[0]?.cnt || 0);

            // Total auth requests = count of radpostauth entries (all-time)
            try {
                const authResult = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
                    SELECT COUNT(*) as cnt FROM radpostauth
                `;
                totalAuthRequests = Number(authResult[0]?.cnt || 0);
            } catch {
                // radpostauth table may not exist
            }

            // Total acct requests = total radacct entries (all-time)
            const acctResult = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
                SELECT COUNT(*) as cnt FROM radacct
            `;
            totalAcctRequests = Number(acctResult[0]?.cnt || 0);
        } catch (dbErr: any) {
            console.error('Error querying radacct stats:', dbErr.message);
        }

        return NextResponse.json({
            success: true,
            status: {
                running,
                pid,
                uptime,
                cpu,
                memory,
                memoryMB,
                version,
                startTime,
                activeConnections,
                totalAuthRequests,
                totalAcctRequests,
                lastRestart: startTime,
            }
        });

    } catch (error: any) {
        console.error('Error getting FreeRADIUS status:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to get status' },
            { status: 500 }
        );
    }
}
