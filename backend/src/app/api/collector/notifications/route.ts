import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 30;

/**
 * The bell's list: stored notifications, newest first, each with its read
 * state. `unread` drives the badge. (The earlier version rebuilt the list from
 * the last 24 hours of payments and tickets on every call, so nothing could
 * be read and the same entries kept coming back.)
 */
export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [rows, unread] = await Promise.all([
    prisma.collectorNotification.findMany({
      where: { collectorId: collector.id, createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) } },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    }),
    prisma.collectorNotification.count({ where: { collectorId: collector.id, readAt: null } }),
  ]);

  // Tidy this collector's old rows while we are here; the daily cleanup job covers the rest.
  void prisma.collectorNotification
    .deleteMany({ where: { collectorId: collector.id, createdAt: { lt: new Date(Date.now() - 60 * DAY_MS) } } })
    .catch(() => {});

  return NextResponse.json({
    success: true,
    unread,
    events: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      link: n.link,
      timestamp: n.createdAt.toISOString(),
      read: !!n.readAt,
    })),
  });
}

/** Mark as read: `{ ids: [...] }` for some, `{ all: true }` for every unread one. */
export async function POST(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((v: unknown): v is string => typeof v === 'string').slice(0, 100) : [];
  if (!body?.all && ids.length === 0) {
    return NextResponse.json({ error: 'ids atau all wajib diisi' }, { status: 400 });
  }

  // Scoped to this collector: someone else's id simply matches nothing.
  const result = await prisma.collectorNotification.updateMany({
    where: { collectorId: collector.id, readAt: null, ...(body?.all ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ success: true, updated: result.count });
}
