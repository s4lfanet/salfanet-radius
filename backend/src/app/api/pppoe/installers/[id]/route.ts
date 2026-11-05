import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { requirePermission } from '@/server/middleware/api-auth';

/**
 * PATCH /api/pppoe/installers/:id { name?, isActive? }
 * Rename, deactivate or reactivate. Deactivating keeps every customer link;
 * the installer only disappears from the form dropdown.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authCheck = await requirePermission('customers.edit');
  if (!authCheck.authorized) return authCheck.response;
  const session = authCheck.session;
  const { id } = await params;

  try {
    const current = await prisma.installer.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Instalatur tidak ditemukan' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const data: { name?: string; isActive?: boolean } = {};

    if (body?.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
      if (!name) return NextResponse.json({ error: 'Nama instalatur wajib diisi' }, { status: 400 });
      if (name.length > 100) return NextResponse.json({ error: 'Nama instalatur maksimal 100 karakter' }, { status: 400 });
      if (name !== current.name) {
        const taken = await prisma.installer.findUnique({ where: { name } });
        if (taken) return NextResponse.json({ error: `Instalatur "${name}" sudah ada` }, { status: 409 });
        data.name = name;
      }
    }
    if (typeof body?.isActive === 'boolean') data.isActive = body.isActive;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ installer: current });
    }

    const installer = await prisma.installer.update({
      where: { id },
      data,
      include: { _count: { select: { users: true } } },
    });

    const changes = [
      data.name ? `nama "${current.name}" → "${data.name}"` : null,
      data.isActive === false ? 'dinonaktifkan' : data.isActive === true && !current.isActive ? 'diaktifkan kembali' : null,
    ].filter(Boolean).join(', ');

    await logActivity({
      username: session?.user?.name || 'System',
      userRole: session?.user?.role,
      action: 'UPDATE_INSTALLER',
      description: `Instalatur "${installer.name}" ${changes || 'diperbarui'}`,
      module: 'pppoe',
      status: 'success',
      metadata: { installerId: id, ...data },
    });

    const { _count, ...rest } = installer;
    return NextResponse.json({ installer: { ...rest, customerCount: _count.users } });
  } catch (error) {
    console.error('Update installer error:', error);
    return NextResponse.json({ error: 'Gagal menyimpan instalatur' }, { status: 500 });
  }
}
