import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

// GET /api/admin/data-usage — user usage with optional filters
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const where: Record<string, unknown> = { period_start: { gte: start, lte: end } };
    if (username) where.username = username;

    const records = await prisma.data_usage_by_period.findMany({
      where: where as never,
      orderBy: { period_start: 'desc' },
      take: 500,
    });

    const data = records.map((r) => ({
      username: r.username,
      period_start: r.period_start,
      period_end: r.period_end,
      upload_bytes: Number(r.acctinputoctets || 0),
      download_bytes: Number(r.acctoutputoctets || 0),
      total_bytes: Number((r.acctinputoctets || BigInt(0)) + (r.acctoutputoctets || BigInt(0))),
      upload_gb: (Number(r.acctinputoctets || 0) / 1e9).toFixed(3),
      download_gb: (Number(r.acctoutputoctets || 0) / 1e9).toFixed(3),
      total_gb: (Number((r.acctinputoctets || BigInt(0)) + (r.acctoutputoctets || BigInt(0))) / 1e9).toFixed(3),
    }));

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to fetch usage data' }, { status: 500 });
  }
}

// POST /api/admin/data-usage — trigger manual aggregation
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('settings.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
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
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to aggregate usage' }, { status: 500 });
  }
}
