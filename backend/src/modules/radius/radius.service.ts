import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { nowWIB } from '../../common/utils/timezone';
import { nanoid } from 'nanoid';

@Injectable()
export class RadiusService {
  private readonly logger = new Logger(RadiusService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * RADIUS Authorize Hook — ported from /api/radius/authorize
   * Called by FreeRADIUS before authentication to check if user is allowed to login.
   */
  async authorize(username: string): Promise<{
    status: number;
    body?: Record<string, unknown>;
  }> {
    if (!username) return { status: 204 };

    try {
      // Check if hotspot voucher
      const voucher = await this.prisma.hotspotVoucher.findUnique({
        where: { code: username },
        include: { profile: true },
      });

      if (!voucher) {
        // Check PPPoE user
        const pppoeUser = await this.prisma.pppoeUser.findUnique({
          where: { username },
          select: { id: true, username: true, status: true, expiredAt: true, name: true, autoIsolationEnabled: true },
        });

        if (pppoeUser) {
          const now = new Date();

          if (pppoeUser.status === 'blocked' || pppoeUser.status === 'BLOCKED') {
            await this.logRejection(username, 'Akun Diblokir - Hubungi Admin');
            return { status: 200, body: { 'control:Auth-Type': 'Reject', 'reply:Reply-Message': 'Akun Diblokir - Hubungi Admin' } };
          }

          if (pppoeUser.status === 'stop' || pppoeUser.status === 'suspended' || pppoeUser.status === 'SUSPENDED') {
            await this.logRejection(username, 'Langganan Dihentikan - Hubungi Admin');
            return { status: 200, body: { 'control:Auth-Type': 'Reject', 'reply:Reply-Message': 'Langganan Dihentikan - Hubungi Admin' } };
          }

          // Isolated users allowed to login with isolir profile
          if (pppoeUser.status === 'isolated' || pppoeUser.status === 'ISOLATED') {
            return { status: 204 };
          }

          // Check expiry
          if (pppoeUser.expiredAt && now > new Date(pppoeUser.expiredAt)) {
            if (pppoeUser.autoIsolationEnabled !== false) {
              await this.logRejection(username, 'Masa Aktif Habis - Segera Bayar Tagihan');
              return { status: 200, body: { 'control:Auth-Type': 'Reject', 'reply:Reply-Message': 'Masa Aktif Habis - Segera Bayar Tagihan' } };
            }
            return { status: 204 };
          }

          return { status: 204 };
        }

        // User not found
        await this.logRejection(username, 'User Tidak Terdaftar');
        return { status: 200, body: { 'control:Auth-Type': 'Reject', 'reply:Reply-Message': 'User Tidak Terdaftar' } };
      }

      const now = new Date();

      // Voucher status EXPIRED
      if (voucher.status === 'EXPIRED') {
        await this.logRejection(username, 'Kode Voucher Kadaluarsa');
        return { status: 200, body: { 'control:Auth-Type': 'Reject', 'reply:Reply-Message': 'Kode Voucher Kadaluarsa' } };
      }

      // Voucher expiresAt in the past
      if (voucher.expiresAt && now > voucher.expiresAt) {
        await this.prisma.hotspotVoucher.update({ where: { id: voucher.id }, data: { status: 'EXPIRED' } });
        await this.logRejection(username, 'Kode Voucher Kadaluarsa');
        return { status: 200, body: { 'control:Auth-Type': 'Reject', 'reply:Reply-Message': 'Kode Voucher Kadaluarsa' } };
      }

      // Check active session timeout
      if (voucher.firstLoginAt && voucher.expiresAt) {
        const activeSession = await this.prisma.radacct.findFirst({
          where: { username: voucher.code, acctstoptime: null },
          orderBy: { acctstarttime: 'desc' },
        });
        if (activeSession && now > voucher.expiresAt) {
          await this.logRejection(username, 'Waktu Habis - Voucher Kadaluarsa');
          return { status: 200, body: { 'control:Auth-Type': 'Reject', 'reply:Reply-Message': 'Waktu Habis - Voucher Kadaluarsa' } };
        }
      }

      // Voucher valid — set Cleartext-Password = username (voucher code is both username and password)
      return { status: 200, body: { 'control:Cleartext-Password': username } };
    } catch (error) {
      this.logger.error('[AUTHORIZE] Error:', error);
      return { status: 204 };
    }
  }

  /**
   * RADIUS Post-Auth Hook — ported from /api/radius/post-auth
   * Called after successful authentication to set firstLoginAt/expiresAt and sync Keuangan.
   */
  async postAuth(username: string, reply: string): Promise<{
    status: number;
    body?: Record<string, unknown>;
  }> {
    if (reply !== 'Access-Accept') return { status: 204 };

    try {
      const voucher = await this.prisma.hotspotVoucher.findUnique({
        where: { code: username },
        include: { profile: true },
      });

      if (!voucher) return { status: 204 };

      const now = nowWIB();

      // Check if already expired
      if (voucher.expiresAt && now > voucher.expiresAt) {
        await this.prisma.hotspotVoucher.update({ where: { id: voucher.id }, data: { status: 'EXPIRED' } });
        return { status: 200, body: { 'control:Auth-Type': 'Reject', 'reply:Reply-Message': 'Voucher Kadaluarsa' } };
      }

      // First login: set firstLoginAt and calculate expiresAt
      if (!voucher.firstLoginAt) {
        const { validityValue, validityUnit } = voucher.profile;
        let intervalMs = 0;
        switch (validityUnit) {
          case 'MINUTES': intervalMs = validityValue * 60 * 1000; break;
          case 'HOURS': intervalMs = validityValue * 60 * 60 * 1000; break;
          case 'DAYS': intervalMs = validityValue * 24 * 60 * 60 * 1000; break;
          case 'MONTHS': intervalMs = validityValue * 30 * 24 * 60 * 60 * 1000; break;
        }

        const expiresAt = new Date(now.getTime() + intervalMs);
        await this.prisma.hotspotVoucher.update({
          where: { id: voucher.id },
          data: { firstLoginAt: now, expiresAt, status: 'ACTIVE' },
        });

        // Auto-sync to Keuangan (only for non-order vouchers)
        if (!voucher.orderId) {
          try {
            const hotspotCategory = await this.prisma.transactionCategory.findUnique({
              where: { id: 'cat-income-hotspot' },
            });

            if (hotspotCategory) {
              const existingTransaction = await this.prisma.transaction.findFirst({
                where: { reference: `VOUCHER-${voucher.code}` },
              });

              if (!existingTransaction) {
                const isAgentVoucher = voucher.agentId !== null;
                const incomeAmount = voucher.profile.sellingPrice;

                await this.prisma.transaction.create({
                  data: {
                    id: nanoid(), categoryId: hotspotCategory.id, type: 'INCOME',
                    amount: incomeAmount,
                    description: `Voucher ${voucher.profile.name} - ${voucher.code}${isAgentVoucher ? ' (Agent)' : ''}`,
                    date: now, reference: `VOUCHER-${voucher.code}`,
                    notes: `Pendapatan voucher hotspot (Harga Jual: Rp ${incomeAmount}, Harga Modal: Rp ${voucher.profile.costPrice})`,
                  },
                });

                // Agent commission
                if (isAgentVoucher && voucher.profile.resellerFee > 0) {
                  const agentCategory = await this.prisma.transactionCategory.findUnique({
                    where: { id: 'cat-expense-komisi' },
                  });
                  if (agentCategory) {
                    const agent = await this.prisma.agent.findUnique({
                      where: { id: voucher.agentId! },
                      select: { name: true },
                    });
                    const commissionAmount = voucher.profile.resellerFee;
                    await this.prisma.transaction.create({
                      data: {
                        id: nanoid(), categoryId: agentCategory.id, type: 'EXPENSE',
                        amount: commissionAmount,
                        description: `Komisi Agent ${agent?.name || 'Unknown'} - Voucher ${voucher.code}`,
                        date: now, reference: `COMMISSION-${voucher.code}`,
                        notes: `Komisi agent untuk voucher ${voucher.profile.name}`,
                      },
                    });
                  }
                }
              }
            }
          } catch (keuanganError) {
            this.logger.error('[POST-AUTH] Keuangan sync error:', keuanganError);
          }
        }
      }

      return { status: 204 };
    } catch (error) {
      this.logger.error('[POST-AUTH] Error:', error);
      return { status: 204 };
    }
  }

  /**
   * RADIUS Accounting Hook — ported from /api/radius/accounting
   * Logs accounting events for debugging. radacct is handled by FreeRADIUS SQL module.
   */
  async accounting(body: {
    username?: string; statusType?: string; nasIp?: string;
    sessionTime?: number; inputOctets?: number; outputOctets?: number;
  }): Promise<{ status: number }> {
    try {
      if (!body.username || !body.statusType) return { status: 204 };

      const normalizedStatus = body.statusType?.toLowerCase();
      if (normalizedStatus === 'start') {
        this.logger.log(`[ACCOUNTING] START: ${body.username} from ${body.nasIp}`);
      } else if (normalizedStatus === 'stop') {
        this.logger.log(`[ACCOUNTING] STOP: ${body.username} | session ${body.sessionTime}s | in: ${body.inputOctets}B out: ${body.outputOctets}B`);
      }
      return { status: 204 };
    } catch (error) {
      this.logger.error('[ACCOUNTING] Error:', error);
      return { status: 204 };
    }
  }

  /**
   * RADIUS CoA (Change of Authorization) — ported from /api/radius/coa
   * Note: CoA execution (radclient) is deferred to integration batch.
   * This endpoint currently validates requests and returns status.
   */
  async coa(body: { action: string; username?: string; attributes?: Record<string, unknown>; host?: string }) {
    // CoA execution requires radclient — deferred to integration batch
    return {
      error: 'CoA execution deferred to integration batch',
      suggestion: 'Use legacy /api/radius/coa endpoint until radclient integration is ported',
      action: body.action,
      username: body.username,
    };
  }

  private async logRejection(username: string, replyMessage: string): Promise<void> {
    try {
      await this.prisma.radpostauth.create({
        data: {
          username, pass: replyMessage, reply: 'Access-Reject', authdate: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('[AUTHORIZE] Failed to log rejection:', error);
    }
  }
}
