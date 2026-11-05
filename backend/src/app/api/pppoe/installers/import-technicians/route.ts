import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { requirePermission } from '@/server/middleware/api-auth';
import { installerIdForTechnician } from '@/server/services/installer.service';

/**
 * GET  → how many customers without an installer were registered (PSB) by a
 *        technician, so the page can offer to fill them in
 * POST → give each of those customers the installer made from that
 *        technician. Customers that already have an installer are untouched.
 */
export async function GET() {
  const authCheck = await requirePermission('customers.view');
  if (!authCheck.authorized) return authCheck.response;

  const count = await prisma.pppoeUser.count({
    where: { installerId: null, registeredByTechnicianId: { not: null } },
  });
  return NextResponse.json({ count });
}

export async function POST() {
  const authCheck = await requirePermission('customers.edit');
  if (!authCheck.authorized) return authCheck.response;
  const session = authCheck.session;

  try {
    const groups = await prisma.pppoeUser.groupBy({
      by: ['registeredByTechnicianId'],
      where: { installerId: null, registeredByTechnicianId: { not: null } },
      _count: { _all: true },
    });

    let assigned = 0;
    for (const g of groups) {
      const installerId = await installerIdForTechnician(g.registeredByTechnicianId);
      if (!installerId) continue;
      const { count } = await prisma.pppoeUser.updateMany({
        where: { installerId: null, registeredByTechnicianId: g.registeredByTechnicianId },
        data: { installerId },
      });
      assigned += count;
    }

    await logActivity({
      username: session?.user?.name || 'System',
      userRole: session?.user?.role,
      action: 'IMPORT_INSTALLERS',
      description: `${assigned} pelanggan PSB diberi instalatur dari teknisi yang mendaftarkannya`,
      module: 'pppoe',
      status: 'success',
      metadata: { assigned, technicians: groups.length },
    });

    return NextResponse.json({ assigned, technicians: groups.length });
  } catch (error) {
    console.error('Import installers error:', error);
    return NextResponse.json({ error: 'Gagal mengisi instalatur dari data PSB' }, { status: 500 });
  }
}
