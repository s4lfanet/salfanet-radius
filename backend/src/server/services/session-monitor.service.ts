import 'server-only'
import { prisma } from '@/server/db/client';
import { NotificationService } from '@/server/services/notifications/dispatcher.service';
import { nowWIB } from '@/lib/timezone';
// ⚠️ TZ NOTE: MySQL DATETIME columns (acctstarttime, acctstoptime, authdate) are stored as
// WIB naive datetimes. Prisma appends 'Z' making them appear as UTC, creating a 7-hour offset.
// All Date comparisons for Prisma WHERE clauses MUST use nowWIB() (not Date.now() or new Date()).
// nowWIB() returns a Date where UTC values represent WIB time — consistent with DB values.

export const SessionMonitor = {
  /**
   * Monitor for suspicious login patterns
   */
  async checkSuspiciousActivity(username: string, ipAddress: string) {
    try {
      // Check for multiple failed login attempts in last hour
      const recentFailures = await prisma.radpostauth.count({
        where: {
          username: username,
          reply: 'Access-Reject',
          authdate: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          },
        },
      });

      if (recentFailures >= 5) {
        await NotificationService.notifySuspiciousActivity({
          username,
          activity: `${recentFailures} failed login attempts in the last hour`,
          ipAddress,
        });
      }

      // Check for concurrent sessions from different locations
      const activeSessions = await prisma.radacct.findMany({
        where: {
          username: username,
          acctstoptime: null,
        },
        select: {
          framedipaddress: true,
          nasipaddress: true,
          acctstarttime: true,
        },
      });

      if (activeSessions.length > 1) {
        const uniqueNas = new Set(activeSessions.map((s: any) => s.nasipaddress));
        if (uniqueNas.size > 1) {
          await NotificationService.notifySuspiciousActivity({
            username,
            activity: `Multiple concurrent sessions from different locations (${uniqueNas.size} locations)`,
            ipAddress,
          });
        }
      }

      // Check for login from unusual IP range
      if (ipAddress && !ipAddress.startsWith('192.168.')) {
        await NotificationService.notifySuspiciousActivity({
          username,
          activity: `Login from external IP address`,
          ipAddress,
        });
      }

    } catch (error) {
      console.error('[Session Monitor] Error checking suspicious activity:', error);
    }
  },

  /**
   * Monitor session timeouts and forced disconnects
   */
  async checkSessionDisconnects() {
    try {
      // Check for sessions that were terminated in the last 5 minutes
      const recentDisconnects = await prisma.radacct.findMany({
        where: {
          acctstoptime: {
            gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
          },
          acctterminatecause: {
            in: ['Admin-Reset', 'Session-Timeout', 'Idle-Timeout'],
          },
        },
        select: {
          username: true,
          acctterminatecause: true,
          acctsessiontime: true,
        },
      });

      // Group by terminate cause
      const disconnectStats = recentDisconnects.reduce((acc: any, session: any) => {
        const cause = session.acctterminatecause || 'Unknown';
        acc[cause] = (acc[cause] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Create notifications for significant disconnects
      if (disconnectStats['Admin-Reset'] && disconnectStats['Admin-Reset'] > 10) {
        await NotificationService.notifySessionDisconnected({
          username: 'multiple users',
          reason: 'administrative action',
          count: disconnectStats['Admin-Reset'],
        });
      }

      if (disconnectStats['Session-Timeout'] && disconnectStats['Session-Timeout'] > 5) {
        await NotificationService.notifySessionDisconnected({
          username: 'multiple users',
          reason: 'session timeout',
          count: disconnectStats['Session-Timeout'],
        });
      }

    } catch (error) {
      console.error('[Session Monitor] Error checking session disconnects:', error);
    }
  },

  /**
   * Check for users with long session times (potential abuse)
   */
  async checkLongSessions() {
    try {
      const longSessions = await prisma.radacct.findMany({
        where: {
          acctstoptime: null,
          acctstarttime: {
            lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
          },
        },
        select: {
          username: true,
          acctstarttime: true,
          framedipaddress: true,
          nasipaddress: true,
        },
        take: 10, // Limit to top 10
      });

      for (const session of longSessions) {
        if (!session.acctstarttime) continue; // Skip if no start time
        
        const sessionDays = Math.floor(
          (Date.now() - new Date(session.acctstarttime).getTime()) / (24 * 60 * 60 * 1000)
        );

        await NotificationService.notifySuspiciousActivity({
          username: session.username,
          activity: `Session active for ${sessionDays} days without disconnection`,
          ipAddress: session.framedipaddress,
        });
      }

    } catch (error) {
      console.error('[Session Monitor] Error checking long sessions:', error);
    }
  },

  /**
   * Run all session monitoring checks
   */
  async runAllChecks() {
    try {
      await Promise.allSettled([
        this.checkSessionDisconnects(),
        this.checkLongSessions(),
      ]);

      console.log('[Session Monitor] Completed all checks');
      return { success: true };
    } catch (error: any) {
      console.error('[Session Monitor] Error running checks:', error);
      return { success: false, error: error.message };
    }
  },
};