import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { requirePermission } from '@/server/middleware/api-auth';

/**
 * GET  /api/pppoe/installers            all installers with customer counts
 * GET  /api/pppoe/installers?active=1   active only (form dropdowns)
 * POST /api/pppoe/installers { name }   create
 *
 * There is no DELETE: an installer is deactivated, never removed, so the
 * customers it installed keep that history.
 */
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('customers.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const activeOnly = request.nextUrl.searchParams.get('active') === '1';
    const [installers, unassigned] = await Promise.all([
      prisma.installer.findMany({
        where: activeOnly ? { isActive: true } : undefined,
        select: {
          id: true,
          name: true,
          isActive: true,
          technicianId: true,
          createdAt: true,
          _count: { select: { users: true } },
        },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      activeOnly ? Promise.resolve(null) : prisma.pppoeUser.count({ where: { installerId: null } }),
    ]);

    return NextResponse.json({
      installers: installers.map(({ _count, ...i }) => ({ ...i, customerCount: _count.users })),
      unassignedCount: unassigned,
    });
  } catch (error) {
    console.error('Get installers error:', error);
    return NextResponse.json({ error: 'Gagal memuat daftar instalatur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('customers.edit');
  if (!authCheck.authorized) return authCheck.response;
  const session = authCheck.session;

  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (!name) return NextResponse.json({ error: 'Nama instalatur wajib diisi' }, { status: 400 });
    if (name.length > 100) return NextResponse.json({ error: 'Nama instalatur maksimal 100 karakter' }, { status: 400 });

    const existing = await prisma.installer.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json(
        { error: existing.isActive ? `Instalatur "${name}" sudah ada` : `Instalatur "${name}" sudah ada dan sedang nonaktif. Aktifkan kembali dari daftar.` },
        { status: 409 },
      );
    }

    const installer = await prisma.installer.create({ data: { name, isActive: body?.isActive !== false } });

    await logActivity({
      username: session?.user?.name || 'System',
      userRole: session?.user?.role,
      action: 'CREATE_INSTALLER',
      description: `Instalatur "${installer.name}" ditambahkan`,
      module: 'pppoe',
      status: 'success',
      metadata: { installerId: installer.id },
    });

    return NextResponse.json({ installer: { ...installer, customerCount: 0 } }, { status: 201 });
  } catch (error) {
    console.error('Create installer error:', error);
    return NextResponse.json({ error: 'Gagal menambah instalatur' }, { status: 500 });
  }
}
