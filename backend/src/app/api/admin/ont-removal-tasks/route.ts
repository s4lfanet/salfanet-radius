import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { logActivity } from '@/server/services/activity-log.service';

// Resolve display names for the dual technician/adminUser id space used by
// `assignedTechnicianId` (same pattern as `ticket.assignedToId` elsewhere).
async function resolveTechnicianNames(ids: string[]): Promise<Map<string, string>> {
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

    const tasks = await prisma.ontRemovalTask.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const usernames = [...new Set(tasks.map((t) => t.username))];
    const users = await prisma.pppoeUser.findMany({
      where: { username: { in: usernames } },
      select: { username: true, name: true, customerId: true, address: true, areaId: true },
    });
    const userMap = new Map(users.map((u) => [u.username, u]));

    const areaIds = [...new Set(users.map((u) => u.areaId).filter(Boolean))] as string[];
    const areas = await prisma.pppoeArea.findMany({
      where: { id: { in: areaIds } },
      select: { id: true, name: true },
    });
    const areaMap = new Map(areas.map((a) => [a.id, a.name]));

    const techIds = [...new Set(tasks.map((t) => t.assignedTechnicianId))];
    const techNames = await resolveTechnicianNames(techIds);

    const enriched = tasks.map((t) => {
      const u = userMap.get(t.username);
      return {
        ...t,
        customerName: u?.name || t.username,
        customerId: u?.customerId || null,
        address: u?.address || null,
        areaName: u?.areaId ? areaMap.get(u.areaId) || null : null,
        technicianName: techNames.get(t.assignedTechnicianId) || 'Unknown',
      };
    });

    return NextResponse.json({ tasks: enriched });
  } catch (error) {
    console.error('ONT removal tasks list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - create a new ONT removal task, assigned to a technician
export async function POST(req: NextRequest) {
  const authCheck = await requirePermission('customers.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { username, assignedTechnicianId, reason } = await req.json();

    if (!username || !assignedTechnicianId) {
      return NextResponse.json(
        { error: 'username dan assignedTechnicianId wajib diisi' },
        { status: 400 }
      );
    }

    const customer = await prisma.pppoeUser.findUnique({
      where: { username },
      select: { username: true },
    });
    if (!customer) {
      return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 });
    }

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
        reason: reason || null,
        createdById: authCheck.userId,
      },
    });

    try {
      const { sendWebPushToTechnician } = await import('@/server/services/push-notification.service');
      await sendWebPushToTechnician(assignedTechnicianId, {
        title: '🔌 Tugas Cabut ONT Baru',
        body: `Cabut ONT untuk pelanggan ${username}${reason ? `: ${reason}` : ''}`,
        url: '/technician/ont-removal-tasks',
        tag: 'ont-task-new',
      });
    } catch { /* best-effort */ }

    await logActivity({
      userId: authCheck.userId,
      username: (authCheck.session.user as any)?.username || 'Admin',
      userRole: (authCheck.session.user as any)?.role,
      action: 'CREATE_ONT_REMOVAL_TASK',
      description: `Membuat task cabut ONT untuk ${username}, ditugaskan ke teknisi`,
      module: 'ont-removal',
      status: 'success',
      request: req,
      metadata: { username, assignedTechnicianId },
    });

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error('ONT removal task create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
