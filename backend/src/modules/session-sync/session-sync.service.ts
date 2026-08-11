import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FreeradiusService } from '../freeradius/freeradius.service';
import { MikrotikService } from '../mikrotik/mikrotik.service';
import { nowWIB } from '../../common/utils/timezone';
import { nanoid } from 'nanoid';
import { randomUUID } from 'crypto';

export interface SyncResult {
  success: boolean;
  inserted?: number;
  closed?: number;
  activated?: number;
  expired?: number;
  routers?: number;
  routerErrors?: number;
  message?: string;
  error?: string;
}

@Injectable()
export class SessionSyncService {
  private readonly logger = new Logger(SessionSyncService.name);
  private pppoeSyncRunning = 0;
  private hotspotSyncRunning = false;
  private readonly PPPoe_LOCK_TTL_MS = 2 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly freeradiusService: FreeradiusService,
    private readonly mikrotikService: MikrotikService,
  ) {}

  /**
   * PPPoE session sync — ported from /server/jobs/pppoe-session-sync.ts.
   * Pure RADIUS approach: closes stale sessions, blocked users, orphans, and imports orphan users.
   */
  async syncPppoeSessions(): Promise<SyncResult> {
    const now = Date.now();
    if (this.pppoeSyncRunning && now - this.pppoeSyncRunning < this.PPPoe_LOCK_TTL_MS) {
      return { success: false, inserted: 0, closed: 0, routers: 0, routerErrors: 0, error: 'Already running' };
    }
    if (this.pppoeSyncRunning) {
      this.logger.log('[PPPoE-Sync] Stale lock detected, resetting');
    }
    this.pppoeSyncRunning = now;
    const startedAt = Date.now();
    let closed = 0;
    let imported = 0;

    try {
      // 1. Close stale sessions — no Accounting-Update in over 90 minutes
      const staleResult = await this.prisma.$executeRaw`
        UPDATE radacct
        SET acctstoptime = NOW(),
            acctterminatecause = 'Lost-Carrier',
            acctsessiontime = GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, acctstarttime, NOW()), 2147483647))
        WHERE acctstoptime IS NULL
          AND acctupdatetime IS NOT NULL
          AND acctupdatetime < DATE_SUB(NOW(), INTERVAL 90 MINUTE)
      `;
      closed += Number(staleResult);
      if (staleResult > 0) this.logger.log(`[PPPoE-Sync] Closed ${staleResult} stale session(s)`);

      // 2. Close sessions for blocked/stop users
      const blockedResult = await this.prisma.$executeRaw`
        UPDATE radacct ra
        INNER JOIN pppoe_users pu ON pu.username = ra.username
        SET ra.acctstoptime = NOW(),
            ra.acctterminatecause = 'Admin-Reset',
            ra.acctsessiontime = GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, ra.acctstarttime, NOW()), 2147483647))
        WHERE ra.acctstoptime IS NULL
          AND pu.status IN ('blocked', 'stop')
      `;
      closed += Number(blockedResult);
      if (blockedResult > 0) this.logger.log(`[PPPoE-Sync] Closed ${blockedResult} session(s) for blocked/stop users`);

      // 3. Auto-import orphan RADIUS sessions into pppoe_users
      const orphanRows = await this.prisma.$queryRaw<Array<{ username: string }>>`
        SELECT DISTINCT ra.username
        FROM radacct ra
        LEFT JOIN pppoe_users pu ON pu.username = ra.username
        LEFT JOIN hotspot_vouchers hv ON hv.code = ra.username
        WHERE ra.acctstoptime IS NULL
          AND pu.id IS NULL
          AND hv.id IS NULL
          AND ra.acctstarttime < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
      `;

      if (orphanRows.length > 0) {
        const defaultProfile = await this.prisma.pppoeProfile.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true, groupName: true },
        });

        for (const { username } of orphanRows) {
          try {
            const userGroup = await this.prisma.radusergroup.findFirst({
              where: { username },
              select: { groupname: true },
            });

            let profileId = defaultProfile?.id;
            if (userGroup?.groupname) {
              const matchedProfile = await this.prisma.pppoeProfile.findFirst({
                where: { groupName: userGroup.groupname, isActive: true },
                select: { id: true },
              });
              if (matchedProfile) profileId = matchedProfile.id;
            }

            if (!profileId) {
              this.logger.log(`[PPPoE-Sync] Skip import "${username}" — no profile found`);
              continue;
            }

            const radcheckRow = await this.prisma.radcheck.findFirst({
              where: { username, attribute: 'Cleartext-Password' },
              select: { value: true },
            });

            await this.prisma.pppoeUser.create({
              data: {
                id: randomUUID(),
                username,
                password: radcheckRow?.value || 'radius-imported',
                profileId,
                name: username,
                phone: '-',
                status: 'active',
                syncedToRadius: true,
                lastSyncAt: new Date(),
                comment: 'Auto-imported dari sesi RADIUS aktif',
              },
            });
            imported++;
            this.logger.log(`[PPPoE-Sync] Imported user "${username}"`);
          } catch (importErr: any) {
            if (!importErr.message?.includes('Unique constraint')) {
              this.logger.error(`[PPPoE-Sync] Gagal import "${username}": ${importErr.message}`);
            }
          }
        }
      }

      // 4. Close remaining orphan sessions
      const orphanResult = await this.prisma.$executeRaw`
        UPDATE radacct ra
        LEFT JOIN pppoe_users pu ON pu.username = ra.username
        LEFT JOIN hotspot_vouchers hv ON hv.code = ra.username
        SET ra.acctstoptime = NOW(),
            ra.acctterminatecause = 'Lost-Carrier',
            ra.acctsessiontime = GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, ra.acctstarttime, NOW()), 2147483647))
        WHERE ra.acctstoptime IS NULL
          AND pu.id IS NULL
          AND hv.id IS NULL
          AND ra.acctstarttime < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
      `;
      closed += Number(orphanResult);
      if (orphanResult > 0) this.logger.log(`[PPPoE-Sync] Closed ${orphanResult} orphan session(s)`);

      // 5. Update acctsessiontime for all active sessions
      await this.prisma.$executeRaw`
        UPDATE radacct
        SET acctsessiontime = GREATEST(0, LEAST(TIMESTAMPDIFF(SECOND, acctstarttime, NOW()), 2147483647))
        WHERE acctstoptime IS NULL
          AND acctstarttime IS NOT NULL
          AND acctstarttime > '2000-01-01'
      `;

      // 6. Count active NAS
      const nasCount = await this.prisma.$queryRaw<Array<{ cnt: bigint }>>`
        SELECT COUNT(DISTINCT nasipaddress) as cnt
        FROM radacct
        WHERE acctstoptime IS NULL
      `;
      const activeNasCount = Number(nasCount[0]?.cnt || 0);

      // 7. Log to cronHistory
      const duration = Date.now() - startedAt;
      const message = `Pure RADIUS sync: ${closed} closed, ${imported} imported, ${activeNasCount} active NAS(es)`;
      await this.prisma.cronHistory.create({
        data: {
          id: nanoid(),
          jobType: 'pppoe_session_sync',
          status: 'success',
          startedAt: new Date(startedAt),
          completedAt: new Date(),
          duration,
          result: message,
        },
      });

      return { success: true, inserted: imported, closed, routers: activeNasCount, routerErrors: 0, message };
    } catch (error: any) {
      this.logger.error('[PPPoE-Sync] Error:', error.message);
      await this.prisma.cronHistory.create({
        data: {
          id: nanoid(),
          jobType: 'pppoe_session_sync',
          status: 'error',
          startedAt: new Date(startedAt),
          completedAt: new Date(),
          duration: Date.now() - startedAt,
          error: error.message,
        },
      }).catch(() => {});
      return { success: false, inserted: 0, closed, routers: 0, routerErrors: 0, error: error.message };
    } finally {
      this.pppoeSyncRunning = 0;
    }
  }

  /**
   * Hotspot voucher/session sync — ported from /server/jobs/hotspot-sync.ts.
   * Activates WAITING vouchers on first login, expires ACTIVE vouchers past expiry, disconnects via MikroTik API.
   */
  async syncHotspotSessions(): Promise<SyncResult> {
    if (this.hotspotSyncRunning) {
      return { success: false, activated: 0, expired: 0, error: 'Already running' };
    }
    this.hotspotSyncRunning = true;
    const startedAt = new Date();

    const history = await this.prisma.cronHistory.create({
      data: { id: nanoid(), jobType: 'hotspot_sync', status: 'running', startedAt },
    });

    try {
      // PART 1: WAITING → ACTIVE on first login
      const waitingVouchers = await this.prisma.hotspotVoucher.findMany({
        where: { status: 'WAITING' },
        select: { id: true, code: true, profile: true },
      });

      let activatedCount = 0;
      for (const voucher of waitingVouchers) {
        const activeSession = await this.prisma.radacct.findFirst({
          where: { username: voucher.code, acctstarttime: { not: null } },
          orderBy: { acctstarttime: 'asc' },
        });

        if (activeSession && activeSession.acctstarttime) {
          const firstLoginAt = new Date(activeSession.acctstarttime);
          let expiresAtMs = firstLoginAt.getTime();

          if (voucher.profile.validityUnit === 'MINUTES') {
            expiresAtMs += voucher.profile.validityValue * 60 * 1000;
          } else if (voucher.profile.validityUnit === 'HOURS') {
            expiresAtMs += voucher.profile.validityValue * 60 * 60 * 1000;
          } else if (voucher.profile.validityUnit === 'DAYS') {
            expiresAtMs += voucher.profile.validityValue * 24 * 60 * 60 * 1000;
          } else if (voucher.profile.validityUnit === 'MONTHS') {
            const expiresAt = new Date(firstLoginAt);
            expiresAt.setMonth(expiresAt.getMonth() + voucher.profile.validityValue);
            expiresAtMs = expiresAt.getTime();
          }

          const expiresAt = new Date(expiresAtMs);
          const updatedVoucher = await this.prisma.hotspotVoucher.update({
            where: { id: voucher.id },
            data: { status: 'ACTIVE', firstLoginAt, expiresAt },
          });

          if (updatedVoucher.agentId) {
            try {
              await this.prisma.agentNotification.create({
                data: {
                  id: Math.random().toString(36).substring(2, 15),
                  agentId: updatedVoucher.agentId,
                  type: 'voucher_activated',
                  title: 'Voucher Digunakan',
                  message: `Voucher ${voucher.code} (${voucher.profile.name}) telah digunakan.`,
                  link: null,
                },
              });
            } catch {}
          }
          activatedCount++;
        }
      }

      // PART 2: ACTIVE → EXPIRED
      const dbTime = await this.prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() as now`;
      const nowServer = dbTime[0].now;

      const expiredVouchers = await this.prisma.hotspotVoucher.findMany({
        where: { status: 'ACTIVE', expiresAt: { lte: nowServer } },
        select: { id: true, code: true, expiresAt: true },
      });

      let expiredCount = 0;
      for (const voucher of expiredVouchers) {
        try {
          const updatedVoucher = await this.prisma.hotspotVoucher.update({
            where: { id: voucher.id },
            data: { status: 'EXPIRED' },
            include: { profile: { select: { name: true } } },
          });

          if (updatedVoucher.agentId) {
            try {
              await this.prisma.agentNotification.create({
                data: {
                  id: Math.random().toString(36).substring(2, 15),
                  agentId: updatedVoucher.agentId,
                  type: 'voucher_expired',
                  title: 'Voucher Kadaluarsa',
                  message: `Voucher ${voucher.code} (${updatedVoucher.profile.name}) telah melewati masa aktif.`,
                  link: null,
                },
              });
            } catch {}
          }

          // Disconnect via MikroTik API
          try {
            const activeSession = await this.prisma.radacct.findFirst({
              where: { username: voucher.code, acctstoptime: null },
              select: { radacctid: true, nasipaddress: true, acctsessionid: true, framedipaddress: true, acctstarttime: true },
            });

            let nas: any = null;
            if (activeSession) {
              nas = await this.prisma.router.findFirst({
                where: { OR: [{ nasname: activeSession.nasipaddress }, { ipAddress: activeSession.nasipaddress }] },
              });
            }
            if (!nas) {
              nas = await this.prisma.router.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
            }

            if (nas) {
              const disconnectResult = await this.mikrotikService.disconnectUser(voucher.code, nas.id);
              if (!disconnectResult.success) {
                // Fallback to CoA
                await this.freeradiusService.sendCoADisconnect({
                  username: voucher.code,
                  nasIpAddress: nas.ipAddress || nas.nasname,
                  nasSecret: nas.secret,
                  sessionId: activeSession?.acctsessionid || undefined,
                  framedIp: activeSession?.framedipaddress || undefined,
                });
              }
            }

            if (activeSession) {
              const stopTime = nowWIB();
              let sessionDuration = 0;
              if (activeSession.acctstarttime) {
                sessionDuration = Math.floor((stopTime.getTime() - new Date(activeSession.acctstarttime).getTime()) / 1000);
                if (sessionDuration < 0) sessionDuration = 0;
              }
              await this.prisma.radacct.update({
                where: { radacctid: activeSession.radacctid },
                data: { acctstoptime: stopTime, acctterminatecause: 'Session-Timeout', acctsessiontime: sessionDuration },
              });
            }
          } catch (disconnectError: any) {
            this.logger.error(`[Hotspot Sync] Disconnect error for ${voucher.code}: ${disconnectError.message}`);
          }

          // Cleanup FreeRADIUS tables
          try {
            const userGroup = await this.prisma.radusergroup.findFirst({
              where: { username: voucher.code },
              select: { groupname: true },
            });

            await this.prisma.radcheck.updateMany({
              where: { username: voucher.code, attribute: 'Cleartext-Password' },
              data: { value: 'EXPIRED' },
            });

            const existingReply = await this.prisma.radreply.findFirst({
              where: { username: voucher.code, attribute: 'Reply-Message' },
            });
            if (!existingReply) {
              await this.prisma.radreply.create({
                data: { username: voucher.code, attribute: 'Reply-Message', op: '=', value: 'Kode Voucher Kadaluarsa' },
              });
            } else {
              await this.prisma.radreply.update({
                where: { id: existingReply.id },
                data: { value: 'Kode Voucher Kadaluarsa' },
              });
            }

            await this.prisma.radusergroup.deleteMany({ where: { username: voucher.code } });
            if (userGroup?.groupname) {
              await this.prisma.radgroupreply.deleteMany({ where: { groupname: userGroup.groupname } });
            }
          } catch (cleanupError: any) {
            this.logger.error(`[Hotspot Sync] Cleanup error for ${voucher.code}: ${cleanupError.message}`);
          }

          expiredCount++;
        } catch (error: any) {
          this.logger.error(`[Hotspot Sync] Failed to expire ${voucher.code}: ${error.message}`);
        }
      }

      const duration = new Date().getTime() - startedAt.getTime();
      const message = `Activated: ${activatedCount}, Expired: ${expiredCount}`;
      await this.prisma.cronHistory.update({
        where: { id: history.id },
        data: { status: 'success', result: message, duration, completedAt: new Date() },
      });

      return { success: true, activated: activatedCount, expired: expiredCount, message };
    } catch (error: any) {
      this.logger.error('[Hotspot Sync] Error:', error);
      const duration = new Date().getTime() - startedAt.getTime();
      await this.prisma.cronHistory.update({
        where: { id: history.id },
        data: { status: 'failed', result: `Error: ${error.message}`, duration, completedAt: new Date() },
      });
      return { success: false, activated: 0, expired: 0, error: error.message };
    } finally {
      this.hotspotSyncRunning = false;
    }
  }
}
