import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { logActivity } from '@/server/services/activity-log.service';
import { ONT_ELIGIBLE_STATUSES, notifyOntTaskAssignees, reconcileOntTasks } from '@/server/services/ont-removal-task.service';

// Resolve display names for the dual technician/adminUser id space used by
// `assignedTechnicianId` and for `assignedCollectorId` (an adminUser).
async function resolveNames(ids: string[]): Promise<Map<string, string>> {
  const [techs, admins] = await Promise.all([
    prisma.technician.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ]);
  const map = new Map<string, string>();
  for (const t of techs) map.set(t.id, t.name);
  for (const a of admins) map.set(a.id, a.name);
  return map;
}

// GET - list ONT removal tasks (admin)
export async function GET(req: NextRequest) {
  const authCheck = await requirePermission('customers.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    // Cancel tasks whose customer is subscribed again before listing them.
    await reconcileOntTasks();

    const tasks = await prisma.ontRemovalTask.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const usernames = [...new Set(tasks.map((t) => t.username))];
    const users = await prisma.pppoeUser.findMany({
      where: { username: { in: usernames } },
      select: { username: true, name: true, customerId: true, address: true, areaId: true, status: true },
    });
    const userMap = new Map(users.map((u) => [u.username, u]));

    const areaIds = [...new Set(users.map((u) => u.areaId).filter(Boolean))] as string[];
    const areas = await prisma.pppoeArea.findMany({
      where: { id: { in: areaIds } },
      select: { id: true, name: true },
    });
    const areaMap = new Map(areas.map((a) => [a.id, a.name]));

    const assigneeIds = [...new Set(tasks.flatMap((t) => [t.assignedTechnicianId, t.assignedCollectorId]).filter((id): id is string => !!id))];
    const names = await resolveNames(assigneeIds);

    const enriched = tasks.map((t) => {
      const u = userMap.get(t.username);
      return {
        ...t,
        customerName: u?.name || t.username,
        customerId: u?.customerId || null,
        customerStatus: u?.status || null,
        address: u?.address || null,
        areaName: u?.areaId ? areaMap.get(u.areaId) || null : null,
        technicianName: t.assignedTechnicianId ? names.get(t.assignedTechnicianId) || 'Unknown' : null,
        collectorName: t.assignedCollectorId ? names.get(t.assignedCollectorId) || 'Unknown' : null,
      };
    });

    return NextResponse.json({ tasks: enriched });
  } catch (error) {
    console.error('ONT removal tasks list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - create a new ONT removal task, assigned to a technician, a
// collector, or both. Only an admin can start one: a collector reports
// what was done, not what to do.
export async function POST(req: NextRequest) {
  const authCheck = await requirePermission('customers.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const body = await req.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const assignedTechnicianId = typeof body.assignedTechnicianId === 'string' && body.assignedTechnicianId ? body.assignedTechnicianId : null;
    const assignedCollectorId = typeof body.assignedCollectorId === 'string' && body.assignedCollectorId ? body.assignedCollectorId : null;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!username || (!assignedTechnicianId && !assignedCollectorId)) {
      return NextResponse.json(
        { error: 'username dan minimal satu penerima tugas (teknisi atau kolektor) wajib diisi' },
        { status: 400 }
      );
    }

    const customer = await prisma.pppoeUser.findUnique({
      where: { username },
      select: { username: true, status: true },
    });
    if (!customer) {
      return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 });
    }
    if (!ONT_ELIGIBLE_STATUSES.includes(customer.status)) {
      return NextResponse.json({ error: 'Cabut ONT hanya untuk pelanggan yang terisolir atau ditangguhkan' }, { status: 400 });
    }

    if (assignedTechnicianId) {
      const technician = await prisma.technician.findUnique({
        where: { id: assignedTechnicianId },
        select: { id: true, isActive: true },
      });
      const technicianAdmin = !technician
        ? await prisma.adminUser.findUnique({
            where: { id: assignedTechnicianId },
            select: { id: true, isActive: true, role: true },
          })
        : null;
      const technicianValid =
        (technician && technician.isActive) ||
        (technicianAdmin && technicianAdmin.isActive && technicianAdmin.role === 'TECHNICIAN');
      if (!technicianValid) {
        return NextResponse.json({ error: 'Teknisi tidak valid atau tidak aktif' }, { status: 400 });
      }
    }

    if (assignedCollectorId) {
      const collector = await prisma.adminUser.findUnique({
        where: { id: assignedCollectorId },
        select: { isActive: true, role: true },
      });
      if (!collector?.isActive || collector.role !== 'COLLECTOR') {
        return NextResponse.json({ error: 'Kolektor tidak valid atau tidak aktif' }, { status: 400 });
      }
    }

    const existing = await prisma.ontRemovalTask.findFirst({
      where: { username, status: 'PENDING' },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Sudah ada task cabut ONT yang masih pending untuk customer ini' },
        { status: 409 }
      );
    }

    const task = await prisma.ontRemovalTask.create({
      data: {
        username,
        assignedTechnicianId,
        assignedCollectorId,
        reason: reason || null,
        createdById: authCheck.userId,
      },
    });

    await notifyOntTaskAssignees(task, {
      type: 'ont-task-new',
      title: 'Tugas Cabut ONT Baru',
      body: `Cabut ONT untuk pelanggan ${username}${reason ? `: ${reason}` : ''}`,
    });

    const who = [assignedTechnicianId && 'teknisi', assignedCollectorId && 'kolektor'].filter(Boolean).join(' dan ');
    await logActivity({
      userId: authCheck.userId,
      username: (authCheck.session.user as any)?.username || 'Admin',
      userRole: (authCheck.session.user as any)?.role,
      action: 'CREATE_ONT_REMOVAL_TASK',
      description: `Membuat task cabut ONT untuk ${username}, ditugaskan ke ${who}`,
      module: 'ont-removal',
      status: 'success',
      request: req,
      metadata: { username, assignedTechnicianId, assignedCollectorId },
    });

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error('ONT removal task create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
