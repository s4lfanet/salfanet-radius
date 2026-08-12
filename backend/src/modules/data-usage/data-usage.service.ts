import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DataUsageService {
  private readonly logger = new Logger(DataUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== Cron: Aggregate data usage ====================

  /**
   * Run daily at 00:05 — aggregate radacct into data_usage_by_period
   * Diadopsi dari FreeRADIUS process-radacct.sql (fr_new_data_usage_period SP)
   */
  @Cron('5 0 * * *', { name: 'data_usage_aggregate' })
  async aggregateDailyUsage() {
    this.logger.log('Running daily data usage aggregation...');
    try {
      await this.runAggregation();
      this.logger.log('Data usage aggregation completed');
    } catch (err) {
      this.logger.error('Data usage aggregation failed:', err);
    }
  }

  /**
   * Core aggregation logic — process radacct entries since last run
   */
  async runAggregation(): Promise<{ processed: number }> {
    // Find last period_end
    const lastPeriod = await this.prisma.data_usage_by_period.findFirst({
      orderBy: { period_end: 'desc' },
    });

    const periodStart = lastPeriod?.period_end
      ? new Date(lastPeriod.period_end.getTime() + 1000)
      : new Date(0); // from beginning if first run
    const periodEnd = new Date();

    // Get all radacct entries that were active or stopped in this period
    const sessions = await this.prisma.radacct.findMany({
      where: {
        OR: [
          { acctstoptime: { gte: periodStart, lte: periodEnd } },
          { acctstoptime: null, acctstarttime: { lte: periodEnd } },
        ],
      },
      select: {
        username: true,
        acctinputoctets: true,
        acctoutputoctets: true,
        acctstarttime: true,
        acctstoptime: true,
      },
    });

    // Aggregate per user
    const usageMap = new Map<string, { input: bigint; output: bigint }>();
    for (const s of sessions) {
      const existing = usageMap.get(s.username) || { input: 0n, output: 0n };
      usageMap.set(s.username, {
        input: existing.input + BigInt(s.acctinputoctets || 0),
        output: existing.output + BigInt(s.acctoutputoctets || 0),
      });
    }

    // Insert into data_usage_by_period
    const records: {
      username: string;
      period_start: Date;
      period_end: Date | null;
      acctinputoctets: bigint;
      acctoutputoctets: bigint;
    }[] = [];

    for (const [username, usage] of usageMap) {
      records.push({
        username,
        period_start: periodStart,
        period_end: periodEnd,
        acctinputoctets: usage.input,
        acctoutputoctets: usage.output,
      });
    }

    if (records.length > 0) {
      await this.prisma.data_usage_by_period.createMany({ data: records });
    }

    this.logger.log(`Aggregated ${records.length} users for period ${periodStart.toISOString()} → ${periodEnd.toISOString()}`);
    return { processed: records.length };
  }

  // ==================== API: Reports ====================

  /**
   * Get bandwidth usage per user for a date range
   */
  async getUserUsage(params: {
    username?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { username, startDate, endDate } = params;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const where: Record<string, unknown> = {
      period_start: { gte: start, lte: end },
    };
    if (username) where.username = username;

    const records = await this.prisma.data_usage_by_period.findMany({
      where: where as never,
      orderBy: { period_start: 'desc' },
      take: 500,
    });

    return records.map((r) => ({
      username: r.username,
      period_start: r.period_start,
      period_end: r.period_end,
      upload_bytes: Number(r.acctinputoctets || 0),
      download_bytes: Number(r.acctoutputoctets || 0),
      total_bytes: Number((r.acctinputoctets || 0n) + (r.acctoutputoctets || 0n)),
      upload_gb: (Number(r.acctinputoctets || 0) / 1e9).toFixed(3),
      download_gb: (Number(r.acctoutputoctets || 0) / 1e9).toFixed(3),
      total_gb: (Number((r.acctinputoctets || 0n) + (r.acctoutputoctets || 0n)) / 1e9).toFixed(3),
    }));
  }

  /**
   * Get monthly bandwidth summary per user
   */
  async getMonthlySummary(params: { year?: number; month?: number }) {
    const now = new Date();
    const year = params.year || now.getFullYear();
    const month = params.month !== undefined ? params.month : now.getMonth();

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59);

    const records = await this.prisma.data_usage_by_period.findMany({
      where: {
        period_start: { gte: start, lte: end },
      },
      orderBy: { period_start: 'desc' },
    });

    // Aggregate per user
    const userMap = new Map<string, { input: number; output: number; periods: number }>();
    for (const r of records) {
      const existing = userMap.get(r.username) || { input: 0, output: 0, periods: 0 };
      userMap.set(r.username, {
        input: existing.input + Number(r.acctinputoctets || 0),
        output: existing.output + Number(r.acctoutputoctets || 0),
        periods: existing.periods + 1,
      });
    }

    const summary = Array.from(userMap.entries())
      .map(([username, data]) => ({
        username,
        upload_gb: (data.input / 1e9).toFixed(3),
        download_gb: (data.output / 1e9).toFixed(3),
        total_gb: ((data.input + data.output) / 1e9).toFixed(3),
        periods: data.periods,
      }))
      .sort((a, b) => Number(b.total_gb) - Number(a.total_gb));

    return {
      period: `${year}-${String(month + 1).padStart(2, '0')}`,
      total_users: summary.length,
      total_upload_gb: (summary.reduce((s, u) => s + Number(u.upload_gb), 0)).toFixed(3),
      total_download_gb: (summary.reduce((s, u) => s + Number(u.download_gb), 0)).toFixed(3),
      users: summary,
    };
  }

  /**
   * Get top bandwidth consumers
   */
  async getTopConsumers(params: { limit?: number; days?: number }) {
    const limit = params.limit || 20;
    const days = params.days || 30;
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const records = await this.prisma.data_usage_by_period.findMany({
      where: { period_start: { gte: start } },
      select: {
        username: true,
        acctinputoctets: true,
        acctoutputoctets: true,
      },
    });

    const userMap = new Map<string, { input: number; output: number }>();
    for (const r of records) {
      const existing = userMap.get(r.username) || { input: 0, output: 0 };
      userMap.set(r.username, {
        input: existing.input + Number(r.acctinputoctets || 0),
        output: existing.output + Number(r.acctoutputoctets || 0),
      });
    }

    const top = Array.from(userMap.entries())
      .map(([username, data]) => ({
        username,
        upload_gb: (data.input / 1e9).toFixed(3),
        download_gb: (data.output / 1e9).toFixed(3),
        total_gb: ((data.input + data.output) / 1e9).toFixed(3),
      }))
      .sort((a, b) => Number(b.total_gb) - Number(a.total_gb))
      .slice(0, limit);

    return { period_days: days, total_users: userMap.size, top_consumers: top };
  }
}
