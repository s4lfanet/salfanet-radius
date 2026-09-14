import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';

const execAsync = promisify(exec);

export async function GET() {
    const authCheck = await requirePermission('settings.view');
    if (!authCheck.authorized) return authCheck.response;
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
                            // systemctl outputs local time with timezone abbreviation (e.g. "Thu 2026-09-10 09:59:22 WIB")
                            // new Date() cannot reliably parse non-standard TZ abbreviations, so:
                            // 1. Strip the TZ abbreviation
                            // 2. Parse the remaining local datetime
                            // 3. Use Date.parse on the full string as fallback (works for some timezone names)
                            const tzMatch = activeTime.match(/\s([A-Z]{2,5})$/);
                            const cleanedTime = activeTime.replace(/\s+[A-Z]{2,5}$/, '');
                            
                            // Try parsing the cleaned local time, then adjust based on known TZ offset
                            // WIB = UTC+7, WITA = UTC+8, WIT = UTC+9
                            const tzOffsetMap: Record<string, number> = { WIB: 7, WITA: 8, WIT: 9 };
                            const tzAbbr = tzMatch?.[1] || '';
                            const tzOffsetHours = tzOffsetMap[tzAbbr] ?? 7; // default WIB
                            
                            const parsedLocal = new Date(cleanedTime);
                            if (!isNaN(parsedLocal.getTime())) {
                                // parsedLocal was interpreted as if the string were in the server's local TZ.
                                // But the systemctl output is in the system's local timezone already,
                                // and Date.parse handles it correctly when we strip the abbreviation
                                // because the system TZ matches. Use it directly.
                                startTime = parsedLocal.toISOString();
                            } else {
                                // Fallback: parse manually assuming it's "DDD YYYY-MM-DD HH:MM:SS"
                                const m = cleanedTime.match(/^(\w{3})\s+(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
                                if (m) {
                                    const dt = new Date(Date.UTC(+m[2], +m[3]-1, +m[4], +m[5]-tzOffsetHours, +m[6], +m[7]));
                                    startTime = dt.toISOString();
                                }
                            }
                            
                            // Calculate uptime from the correct start time
                            const startMs = new Date(startTime).getTime();
                            const nowMs = Date.now();
                            const uptimeSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
                            
                            const days = Math.floor(uptimeSeconds / 86400);
                            const hours = Math.floor((uptimeSeconds % 86400) / 3600);
                            const minutes = Math.floor((uptimeSeconds % 3600) / 60);
                            const seconds = uptimeSeconds % 60;
                            
                            if (days > 0) {
                                uptime = `${days}h ${String(hours).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
                            } else {
                                uptime = `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
                            }
                        }
                    } catch (err) {
                        console.error('Error getting start time from systemctl:', err);
                        // Fallback to ps method
                        try {
                            const { stdout: startOutput } = await execAsync(`ps -p ${pid} -o lstart --no-headers 2>/dev/null`);
                            // ps lstart format: "Thu Sep 10 09:59:22 2026" — this is in system local time
                            // new Date() parses this correctly in the server's local timezone
                            const parsedDate = new Date(startOutput.trim());
                            if (!isNaN(parsedDate.getTime())) {
                                startTime = parsedDate.toISOString();
                                
                                const startMs = parsedDate.getTime();
                                const nowMs = Date.now();
                                const uptimeSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
                                
                                const days = Math.floor(uptimeSeconds / 86400);
                                const hours = Math.floor((uptimeSeconds % 86400) / 3600);
                                const minutes = Math.floor((uptimeSeconds % 3600) / 60);
                                const seconds = uptimeSeconds % 60;
                                
                                if (days > 0) {
                                    uptime = `${days}h ${String(hours).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
                                } else {
                                    uptime = `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
                                }
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
        let staleSessions = 0;

        try {
            // Active connections = sessions with no stop time in radacct
            // EXCLUDE stale sessions: acctsessiontime=0 + no traffic + start > 10min ago
            // (user authenticated but never sent interim update — likely disconnected without Accounting-Stop)
            const activeResult = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
                SELECT COUNT(*) as cnt FROM radacct 
                WHERE acctstoptime IS NULL
                  AND NOT (
                    (acctsessiontime = 0 OR acctsessiontime IS NULL)
                    AND (acctinputoctets = 0 OR acctinputoctets IS NULL)
                    AND (acctoutputoctets = 0 OR acctoutputoctets IS NULL)
                    AND acctstarttime < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
                  )
            `;
            activeConnections = Number(activeResult[0]?.cnt || 0);

            // Count stale sessions (for UI warning)
            try {
                const staleResult = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
                    SELECT COUNT(*) as cnt FROM radacct 
                    WHERE acctstoptime IS NULL
                      AND (acctsessiontime = 0 OR acctsessiontime IS NULL)
                      AND (acctinputoctets = 0 OR acctinputoctets IS NULL)
                      AND (acctoutputoctets = 0 OR acctoutputoctets IS NULL)
                      AND acctstarttime < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
                `;
                staleSessions = Number(staleResult[0]?.cnt || 0);
            } catch {
                // ignore
            }

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
                staleSessions,
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
