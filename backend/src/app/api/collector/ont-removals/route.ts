import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';
import { reconcileOntTasks } from '@/server/services/ont-removal-task.service';

export const dynamic = 'force-dynamic';

/**
 * GET - the cabut ONT tasks an admin gave to this collector: open ones first,
 * then the recent finished and cancelled ones, each with the customer's
 * current status so a customer who is subscribed again is never shown as
 * something to pull.
 */
export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // A customer who paid or was re-activated no longer needs the task.
    await reconcileOntTasks();

    const tasks = await prisma.ontRemovalTask.findMany({
      where: { assignedCollectorId: collector.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const usernames = [...new Set(tasks.map((t) => t.username))];
    const users = await prisma.pppoeUser.findMany({
      where: { username: { in: usernames } },
      select: {
        username: true,
        name: true,
        customerId: true,
        phone: true,
        address: true,
        areaId: true,
        status: true,
        profile: { select: { name: true } },
      },
    });
    const userMap = new Map(users.map((u) => [u.username, u]));
    const areaIds = [...new Set(users.map((u) => u.areaId).filter(Boolean))] as string[];
    const areas = await prisma.pppoeArea.findMany({ where: { id: { in: areaIds } }, select: { id: true, name: true } });
    const areaMap = new Map(areas.map((a) => [a.id, a.name]));

    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
    const doneIn = (month: string) =>
      tasks.filter((t) => t.status === 'COMPLETED' && t.completedAt && t.completedAt.toISOString().slice(0, 7) === month).length;

    const enriched = tasks.map((t) => {
      const u = userMap.get(t.username);
      return {
        id: t.id,
        username: t.username,
        fullname: u?.name || t.username,
        customerId: u?.customerId || null,
        phone: u?.phone || '',
        address: u?.address || '',
        profileName: u?.profile?.name || '',
        areaName: u?.areaId ? areaMap.get(u.areaId) || null : null,
        customerStatus: u?.status || null,
        reason: t.reason,
        status: t.status,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
        completedNotes: t.completedNotes,
        completedByRole: t.completedByRole,
        cancelReason: t.cancelReason,
        // A technician is on the same task; whoever finishes first closes it.
        withTechnician: !!t.assignedTechnicianId,
      };
    });

    // Open tasks first, then the rest newest first.
    enriched.sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING'));

    return NextResponse.json({
      tasks: enriched,
      pending: enriched.filter((t) => t.status === 'PENDING').length,
      thisMonth: doneIn(thisMonth),
      lastMonth: doneIn(lastMonth),
    });
  } catch (error) {
    console.error('ONT removals error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST - no longer allowed. Cabut ONT is ordered by an admin (Tugas Cabut
 * ONT), who gives it to a collector, a technician, or both. A collector
 * used to log removals on their own, which left "cabut" records for
 * customers who were later subscribed again.
 */
export async function POST(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(
    { error: 'Cabut ONT hanya bisa diperintahkan oleh admin. Kerjakan tugas yang diberikan di menu Cabut ONT.' },
    { status: 403 },
  );
}
