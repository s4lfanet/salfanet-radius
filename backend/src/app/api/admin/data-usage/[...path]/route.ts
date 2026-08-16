import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

// Catch-all for /api/admin/data-usage/*
// Supports: /top?days=30&limit=20, /monthly?year=2026&month=7

export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  const path = request.nextUrl.pathname.replace('/api/admin/data-usage', '');
  const { searchParams } = new URL(request.url);

  try {
    // /top — top consumers
    if (path === '/top') {
      const limit = parseInt(searchParams.get('limit') || '20', 10);
      const days = parseInt(searchParams.get('days') || '30', 10);
      const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const records = await prisma.data_usage_by_period.findMany({
        where: { period_start: { gte: start } },
        select: { username: true, acctinputoctets: true, acctoutputoctets: true },
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

      return NextResponse.json({
        success: true,
        data: { period_days: days, total_users: userMap.size, top_consumers: top },
      });
    }

    // /monthly — monthly summary
    if (path === '/monthly') {
      const now = new Date();
      const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
      const month = parseInt(searchParams.get('month') || String(now.getMonth()), 10);

      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59);

      const records = await prisma.data_usage_by_period.findMany({
        where: { period_start: { gte: start, lte: end } },
        orderBy: { period_start: 'desc' },
      });

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

      return NextResponse.json({
        success: true,
        data: {
          period: `${year}-${String(month + 1).padStart(2, '0')}`,
          total_users: summary.length,
          total_upload_gb: summary.reduce((s, u) => s + Number(u.upload_gb), 0).toFixed(3),
          total_download_gb: summary.reduce((s, u) => s + Number(u.download_gb), 0).toFixed(3),
          users: summary,
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to fetch data usage' }, { status: 500 });
  }
}

// POST /api/admin/data-usage/aggregate — manual aggregation trigger
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  const path = request.nextUrl.pathname.replace('/api/admin/data-usage', '');

  try {
    if (path === '/aggregate') {
      const lastPeriod = await prisma.data_usage_by_period.findFirst({
        orderBy: { period_end: 'desc' },
      });

      const periodStart = lastPeriod?.period_end
        ? new Date(lastPeriod.period_end.getTime() + 1000)
        : new Date(0);
      const periodEnd = new Date();

      const sessions = await prisma.radacct.findMany({
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

      const usageMap = new Map<string, { input: bigint; output: bigint }>();
      for (const s of sessions) {
        const existing = usageMap.get(s.username) || { input: BigInt(0), output: BigInt(0) };
        usageMap.set(s.username, {
          input: existing.input + BigInt(s.acctinputoctets || 0),
          output: existing.output + BigInt(s.acctoutputoctets || 0),
        });
      }

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
        await prisma.data_usage_by_period.createMany({ data: records });
      }

      return NextResponse.json({
        success: true,
        data: { processed: records.length, period_start: periodStart, period_end: periodEnd },
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to aggregate usage' }, { status: 500 });
  }
}
