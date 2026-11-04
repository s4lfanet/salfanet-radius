import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { logActivity } from '@/server/services/activity-log.service';
import { restoreUserAccess } from '@/server/services/pppoe-restore.service';

/**
 * Repair for customers wrongly stopped by the old auto-stop job, which
 * stopped every 'isolated' user whose expiredAt was >30 days old — including
 * customers on an approved suspend (cuti), customers who had paid, and
 * customers isolated only hours before.
 *
 * GET  → list 'stop' customers with the reasons they look wrongly stopped
 * POST { userIds: string[] } → restore the selected customers to 'active'
 */

const DAY = 24 * 60 * 60 * 1000;

type Candidate = {
  id: string;
  username: string;
  name: string;
  customerId: string | null;
  subscriptionType: string;
  expiredAt: Date | null;
  stoppedAt: Date;
  reasons: string[];
  manualStop: boolean;
};

async function findCandidates(): Promise<Candidate[]> {
  const stopped = await prisma.pppoeUser.findMany({
    where: { status: 'stop' },
    select: {
      id: true, username: true, name: true, customerId: true,
      subscriptionType: true, expiredAt: true, updatedAt: true,
      suspendRequests: {
        where: { status: { in: ['APPROVED', 'COMPLETED'] } },
        select: { status: true, startDate: true, endDate: true },
      },
      invoices: {
        select: { status: true, dueDate: true, paidAt: true },
        orderBy: { dueDate: 'desc' },
        take: 12,
      },
    },
  });

  const result: Candidate[] = [];
  for (const u of stopped) {
    const stoppedAt = u.updatedAt;
    const limit = new Date(stoppedAt.getTime() - 30 * DAY);
    const reasons: string[] = [];

    if (u.suspendRequests.length > 0) {
      reasons.push('Sedang/pernah cuti (suspend request disetujui)');
    }

    const overdue = u.invoices.filter((i) => i.status === 'OVERDUE');
    const unpaid = u.invoices.filter((i) => i.status === 'OVERDUE' || i.status === 'PENDING');
    const paidRecently = u.invoices.some(
      (i) => i.status === 'PAID' && i.paidAt && i.paidAt.getTime() >= stoppedAt.getTime() - 35 * DAY,
    );
    if (paidRecently && unpaid.length === 0) {
      reasons.push('Tidak ada tagihan tertunggak, ada pembayaran ≤35 hari sebelum di-stop');
    }

    if (u.subscriptionType === 'POSTPAID') {
      if (!overdue.some((i) => i.dueDate < limit)) {
        reasons.push('POSTPAID tanpa invoice OVERDUE >30 hari');
      }
    } else if (!u.expiredAt || u.expiredAt >= limit) {
      reasons.push('PREPAID belum expired >30 hari saat di-stop');
    }

    if (reasons.length === 0) continue;

    // A manual stop is logged by the status endpoint; auto-stop never logged.
    const manual = await prisma.activityLog.findFirst({
      where: {
        action: 'status_change',
        description: { contains: `Changed user ${u.username} status from` },
        AND: [{ description: { endsWith: 'to stop' } }],
      },
      select: { id: true },
    });

    result.push({
      id: u.id,
      username: u.username,
      name: u.name,
      customerId: u.customerId,
      subscriptionType: u.subscriptionType,
      expiredAt: u.expiredAt,
      stoppedAt,
      reasons,
      manualStop: !!manual,
    });
  }
  return result.sort((a, b) => b.stoppedAt.getTime() - a.stoppedAt.getTime());
}

export async function GET() {
  const authCheck = await requirePermission('customers.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const candidates = await findCandidates();
    return NextResponse.json({ success: true, data: candidates });
  } catch (e: any) {
    console.error('[REPAIR_AUTO_STOP] list failed:', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('customers.edit');
  if (!authCheck.authorized) return authCheck.response;
  const session = authCheck.session;

  try {
    const body = await request.json().catch(() => ({}));
    const userIds: unknown = body?.userIds;
    if (!Array.isArray(userIds) || userIds.length === 0 || !userIds.every((x) => typeof x === 'string')) {
      return NextResponse.json({ success: false, error: 'userIds (string[]) wajib diisi' }, { status: 400 });
    }

    const results = [];
    for (const id of userIds as string[]) {
      try {
        const r = await restoreUserAccess(id, ['stop'], 'REPAIR_AUTO_STOP');
        results.push(r);
        if (r.restored) {
          await logActivity({
            username: session.user?.email || 'system',
            userRole: session.user?.role || 'unknown',
            action: 'status_change',
            description: `Repair auto-stop: user ${r.username} status from stop to active`,
            module: 'pppoe',
            status: 'success',
            metadata: { userId: id, repair: 'auto_stop' },
            request: request as any,
          });
        }
      } catch (e: any) {
        results.push({ username: id, restored: false, message: e?.message || String(e) });
      }
    }

    return NextResponse.json({
      success: true,
      restored: results.filter((r) => r.restored).length,
      results,
    });
  } catch (e: any) {
    console.error('[REPAIR_AUTO_STOP] restore failed:', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed' }, { status: 500 });
  }
}
