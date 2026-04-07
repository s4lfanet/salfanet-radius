/**
 * FreeRADIUS Health Check Cron Job
 * 
 * Monitors FreeRADIUS service health and automatically restarts if needed
 * Can send alerts via WhatsApp/Email if service is down
 */

import { formatWIB } from '@/lib/timezone';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { syncNasClients } from '@/server/services/radius/freeradius.service';
import { getIsolationSettings } from '@/server/services/isolation.service';

const execAsync = promisify(exec);

interface HealthCheckResult {
    success: boolean;
    status: {
        running: boolean;
        pid: number | null;
        uptime: string;
        cpu: number;
        memory: number;
        responsive: boolean;
    };
    action?: string;
    error?: string;
}

/**
 * Check if FreeRADIUS service is running and responsive
 */
async function checkFreeRADIUSHealth(): Promise<HealthCheckResult> {
    try {
        let running = false;
        let pid: number | null = null;
        let uptime = '';
        let cpu = 0;
        let memory = 0;
        let responsive = false;

        // Check if service is active
        try {
            const { stdout } = await execAsync('systemctl is-active freeradius 2>/dev/null || echo inactive');
            running = stdout.trim() === 'active';
        } catch (error) {
            console.error('Error checking systemctl:', error);
        }

        if (running) {
            // Get PID
            try {
                const { stdout: pidOutput } = await execAsync('pgrep -x freeradius 2>/dev/null || pgrep radiusd 2>/dev/null');
                pid = parseInt(pidOutput.trim().split('\n')[0], 10) || null;
            } catch {
                try {
                    const { stdout: pidOutput2 } = await execAsync('cat /var/run/freeradius/freeradius.pid 2>/dev/null || cat /var/run/radiusd/radiusd.pid 2>/dev/null');
                    pid = parseInt(pidOutput2.trim(), 10) || null;
                } catch { }
            }

            // Get resource usage
            if (pid) {
                try {
                    const { stdout: psOutput } = await execAsync(`ps -p ${pid} -o %cpu,%mem --no-headers 2>/dev/null`);
                    const parts = psOutput.trim().split(/\s+/);
                    if (parts.length >= 2) {
                        cpu = parseFloat(parts[0]) || 0;
                        memory = parseFloat(parts[1]) || 0;
                    }
                } catch { }

                // Calculate uptime
                try {
                    const { stdout: activeTimeOutput } = await execAsync('systemctl show freeradius -p ActiveEnterTimestamp --value 2>/dev/null');
                    const activeTime = activeTimeOutput.trim();
                    
                    if (activeTime && activeTime !== 'n/a') {
                        // Remove non-standard timezone abbreviation (e.g. "WIB") before parsing
                        const cleanedTime = activeTime.replace(/\s+[A-Z]{2,5}$/, '');
                        const startMs = new Date(cleanedTime).getTime();
                        const nowMs = Date.now();
                        const uptimeSeconds = Math.floor((nowMs - startMs) / 1000);
                        
                        const days = Math.floor(uptimeSeconds / 86400);
                        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
                        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
                        const seconds = uptimeSeconds % 60;
                        
                        if (days > 0) {
                            uptime = `${days}d ${hours}h ${minutes}m`;
                        } else if (hours > 0) {
                            uptime = `${hours}h ${minutes}m`;
                        } else {
                            uptime = `${minutes}m ${seconds}s`;
                        }
                    }
                } catch { }
            }

            // Test if FreeRADIUS is responsive (try to read config)
            try {
                const { stdout } = await execAsync('freeradius -C 2>&1 || radiusd -C 2>&1', { timeout: 5000 });
                responsive = stdout.includes('Configuration appears to be OK') || !stdout.includes('Error');
            } catch (error: any) {
                // If timeout or error, service might be hung
                responsive = false;
                console.error('FreeRADIUS responsiveness check failed:', error.message);
            }
        }

        return {
            success: true,
            status: {
                running,
                pid,
                uptime,
                cpu,
                memory,
                responsive
            }
        };

    } catch (error: any) {
        console.error('Error in health check:', error);
        return {
            success: false,
            status: {
                running: false,
                pid: null,
                uptime: '',
                cpu: 0,
                memory: 0,
                responsive: false
            },
            error: error.message
        };
    }
}

/**
 * Attempt to restart FreeRADIUS service
 */
async function restartFreeRADIUS(): Promise<{ success: boolean; error?: string }> {
    try {
        await execAsync('systemctl restart freeradius 2>&1');
        
        // Wait a bit and verify it started
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const { stdout } = await execAsync('systemctl is-active freeradius 2>/dev/null || echo inactive');
        const isRunning = stdout.trim() === 'active';
        
        return {
            success: isRunning,
            error: isRunning ? undefined : 'Service failed to start after restart'
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Send alert notification
 */
async function sendAlert(message: string, severity: 'warning' | 'critical') {
    try {
        // Get admin users to notify
        const adminUsers = await prisma.users.findMany({
            where: {
                role: { in: ['ADMIN'] },
                email: { not: '' }
            },
            select: {
                id: true,
                name: true,
                email: true
            }
        });

        if (adminUsers.length === 0) return;

        // Send Email notification to all admins
        try {
            const { EmailService } = await import('@/server/services/notifications/email.service');
            
            for (const admin of adminUsers) {
                if (admin.email) {
                    await EmailService.send({
                        to: admin.email,
                        toName: admin.name || 'Admin',
                        subject: `FreeRADIUS ${severity === 'critical' ? 'CRITICAL' : 'Warning'}: Service Alert`,
                        html: `
                            <h2>🚨 FreeRADIUS Service Alert</h2>
                            <p><strong>Severity:</strong> ${severity.toUpperCase()}</p>
                            <p><strong>Message:</strong></p>
                            <p>${message}</p>
                            <p><strong>Time:</strong> ${formatWIB(new Date())}</p>
                        `,
                        text: message
                    });
                }
            }
        } catch (error) {
            console.error('Failed to send email alert:', error);
        }

    } catch (error) {
        console.error('Error sending alerts:', error);
    }
}

/**
 * Main health check function with auto-recovery
 */
export async function freeradiusHealthCheck(autoRestart = true): Promise<{
    success: boolean;
    status: any;
    action?: string;
    error?: string;
}> {
    const startTime = Date.now();
    
    try {
        const healthCheck = await checkFreeRADIUSHealth();

        // Log the check
        await logActivity({
            username: 'system',
            userRole: 'system',
            action: 'health_check',
            description: `FreeRADIUS health check: ${healthCheck.status.running ? 'Running' : 'Down'}`,
            module: 'system',
            status: healthCheck.status.running ? 'success' : 'error',
            metadata: healthCheck.status
        });

        // If service is not running, try to restart
        if (!healthCheck.status.running && autoRestart) {
            console.log('FreeRADIUS is down, attempting restart...');
            
            const restartResult = await restartFreeRADIUS();
            
            if (restartResult.success) {
                await logActivity({
                    username: 'system',
                    userRole: 'system',
                    action: 'auto_restart',
                    description: 'FreeRADIUS automatically restarted after detecting service down',
                    module: 'system',
                    status: 'success'
                });

                await sendAlert(
                    'FreeRADIUS service was down and has been automatically restarted successfully.',
                    'warning'
                );

                // Log to cronHistory
                await prisma.cronHistory.create({
                    data: {
                        id: crypto.randomUUID(),
                        jobType: 'freeradius_health',
                        status: 'success',
                        startedAt: new Date(startTime),
                        completedAt: new Date(),
                        duration: Date.now() - startTime,
                        result: 'FreeRADIUS was down and restarted successfully'
                    }
                });

                return {
                    success: true,
                    status: healthCheck.status,
                    action: 'restarted'
                };
            } else {
                await logActivity({
                    username: 'system',
                    userRole: 'system',
                    action: 'auto_restart_failed',
                    description: 'FreeRADIUS auto-restart failed',
                    module: 'system',
                    status: 'error',
                    metadata: { error: restartResult.error }
                });

                await sendAlert(
                    `FreeRADIUS service is down and automatic restart FAILED!\n\nError: ${restartResult.error}\n\nManual intervention required!`,
                    'critical'
                );

                // Log to cronHistory
                await prisma.cronHistory.create({
                    data: {
                        id: crypto.randomUUID(),
                        jobType: 'freeradius_health',
                        status: 'error',
                        startedAt: new Date(startTime),
                        completedAt: new Date(),
                        duration: Date.now() - startTime,
                        error: `Auto-restart failed: ${restartResult.error}`
                    }
                });

                return {
                    success: false,
                    status: healthCheck.status,
                    action: 'restart_failed',
                    error: restartResult.error
                };
            }
        }

        // If service is running but not responsive
        if (healthCheck.status.running && !healthCheck.status.responsive && autoRestart) {
            console.log('FreeRADIUS is running but not responsive, attempting restart...');
            
            const restartResult = await restartFreeRADIUS();
            
            await sendAlert(
                `FreeRADIUS service was unresponsive and has been ${restartResult.success ? 'restarted successfully' : 'restart FAILED'}`,
                restartResult.success ? 'warning' : 'critical'
            );

            // Log to cronHistory
            await prisma.cronHistory.create({
                data: {
                    id: crypto.randomUUID(),
                    jobType: 'freeradius_health',
                    status: restartResult.success ? 'success' : 'error',
                    startedAt: new Date(startTime),
                    completedAt: new Date(),
                    duration: Date.now() - startTime,
                    result: restartResult.success ? 'FreeRADIUS was unresponsive and restarted' : undefined,
                    error: restartResult.error
                }
            });

            return {
                success: restartResult.success,
                status: healthCheck.status,
                action: restartResult.success ? 'restarted_unresponsive' : 'restart_failed',
                error: restartResult.error
            };
        }

        // Check if CPU/Memory is too high (potential issue)
        if (healthCheck.status.cpu > 80 || healthCheck.status.memory > 90) {
            await sendAlert(
                `FreeRADIUS is using high resources!\n\nCPU: ${healthCheck.status.cpu}%\nMemory: ${healthCheck.status.memory}%`,
                'warning'
            );
        }

        // ==================== NAS Config Sync ====================
        // Ensure nas-from-db.conf always reflects the current database.
        // syncNasClients() is idempotent — returns true only when the file changed.
        let nasSynced = false;
        let nasSyncError: string | undefined;
        try {
            const configChanged = await syncNasClients();
            if (configChanged) {
                // IMPORTANT: FreeRADIUS 3.x SIGHUP/reload does NOT reload clients.conf/clients.d.
                // Only a full restart picks up new NAS client entries.
                // Active PPPoE/Hotspot sessions survive a brief restart (1-2 sec) since
                // MikroTik maintains sessions independently of RADIUS.
                await execAsync('systemctl restart freeradius 2>&1');
                nasSynced = true;
                console.log('[FreeRADIUS-Health] NAS config was out of sync — restarted to load new clients');
                await logActivity({
                    username: 'system',
                    userRole: 'system',
                    action: 'nas_sync',
                    description: 'FreeRADIUS NAS config was out of sync with DB — updated and restarted',
                    module: 'system',
                    status: 'success',
                });
            }
        } catch (syncErr: any) {
            nasSyncError = syncErr.message;
            console.error('[FreeRADIUS-Health] NAS sync failed:', syncErr.message);
        }

        // ==================== Isolir radgroupreply Init ====================
        // Ensure radgroupreply rows for the 'isolir' group exist.
        // Rate-limit uses UPSERT so admin changes propagate automatically.
        try {
            const company = await prisma.company.findFirst({
                select: { isolationRateLimit: true }
            });
            const rateLimit = company?.isolationRateLimit ?? '64k/64k';
            // Upsert all three isolir attributes: DELETE+INSERT to prevent duplicates.
            // radgroupreply has no UNIQUE constraint, so INSERT IGNORE would keep adding rows.
            await prisma.$executeRaw`
                DELETE FROM radgroupreply
                WHERE groupname = 'isolir' AND attribute = 'Mikrotik-Rate-Limit'
            `;
            await prisma.$executeRaw`
                INSERT INTO radgroupreply (groupname, attribute, op, value)
                VALUES ('isolir', 'Mikrotik-Rate-Limit', ':=', ${rateLimit})
            `;
            await prisma.$executeRaw`
                DELETE FROM radgroupreply
                WHERE groupname = 'isolir' AND attribute = 'Mikrotik-Group'
            `;
            await prisma.$executeRaw`
                INSERT INTO radgroupreply (groupname, attribute, op, value)
                VALUES ('isolir', 'Mikrotik-Group', ':=', 'isolir')
            `;
            await prisma.$executeRaw`
                DELETE FROM radgroupreply
                WHERE groupname = 'isolir' AND attribute = 'Framed-Pool'
            `;
            await prisma.$executeRaw`
                INSERT INTO radgroupreply (groupname, attribute, op, value)
                VALUES ('isolir', 'Framed-Pool', ':=', 'pool-isolir')
            `;
        } catch (isolirErr: any) {
            console.error('[FreeRADIUS-Health] isolir radgroupreply init failed:', isolirErr.message);
        }

        // ==================== Pool-Isolir VPS Route ====================
        // Make sure pool-isolir (192.168.200.0/24) is routable from VPS.
        // The NAS router handles PPPoE for isolated users and assigns 192.168.200.x.
        // We need the VPS to have a route back through the VPN tunnel so responses
        // reach the isolated user and the proxy can see the real source IP.
        try {
            const nasList = await prisma.$queryRaw<{ nasname: string }[]>`
                SELECT nasname FROM nas WHERE type != 'vpn_gateway' LIMIT 1
            `;
            if (nasList.length > 0) {
                const nasIp = nasList[0].nasname;
                // Use the configured IP pool (dynamic from settings, not hardcoded)
                const isolSettings = await getIsolationSettings();
                const ipPool = isolSettings.isolationIpPool ?? '192.168.200.0/24';
                const networkMatch = ipPool.match(/^(\d+\.\d+\.\d+)\.\d+\/\d+$/);
                const networkBase = networkMatch ? networkMatch[1] + '.0' : '192.168.200.0';
                const cidr = ipPool.includes('/') ? ipPool : `${networkBase}/24`;
                // Add route if not already present (exits cleanly if route exists)
                await execAsync(`ip route show ${cidr} | grep -q '${networkBase}' || ip route add ${cidr} via ${nasIp} 2>/dev/null || true`);
            }
        } catch (routeErr: any) {
            // Non-fatal — might lack capability or route already exists
            console.warn('[FreeRADIUS-Health] pool-isolir route check skipped:', routeErr.message);
        }

        // Log successful health check to cronHistory
        await prisma.cronHistory.create({
            data: {
                id: crypto.randomUUID(),
                jobType: 'freeradius_health',
                status: 'success',
                startedAt: new Date(startTime),
                completedAt: new Date(),
                duration: Date.now() - startTime,
                result: `Healthy - Running: ${healthCheck.status.running}, Responsive: ${healthCheck.status.responsive}, CPU: ${healthCheck.status.cpu.toFixed(1)}%, Memory: ${healthCheck.status.memory.toFixed(1)}%${nasSynced ? ' | NAS config synced from DB' : ''}${nasSyncError ? ' | NAS sync error: ' + nasSyncError : ''}`
            }
        });

        return {
            ...healthCheck,
            action: nasSynced ? 'nas_synced' : undefined,
        };

    } catch (error: any) {
        console.error('Error in FreeRADIUS health check:', error);
        
        // Log error to cronHistory
        await prisma.cronHistory.create({
            data: {
                id: crypto.randomUUID(),
                jobType: 'freeradius_health',
                status: 'error',
                startedAt: new Date(startTime),
                completedAt: new Date(),
                duration: Date.now() - startTime,
                error: error.message
            }
        });
        
        return {
            success: false,
            status: null,
            error: error.message
        };
    }
}
