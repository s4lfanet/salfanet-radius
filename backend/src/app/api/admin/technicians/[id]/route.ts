import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import bcrypt from 'bcryptjs';
import { logActivity } from '@/server/services/activity-log.service';
import { TECHNICIAN_PUBLIC_SELECT, toPublicTechnician, checkUsername, checkPassword, usernameTaken } from '@/server/services/technician-account.service';

// PATCH - update a technician: activate/deactivate, name, email, password.
// The username is set once: technicians from before sign-in by username get
// theirs here; after that it stays, as for collectors.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission('users.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { id } = await params;
    const { name, email, isActive, username, password } = await req.json();

    const existing = await prisma.technician.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Teknisi tidak ditemukan' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email || null;
    if (isActive !== undefined) data.isActive = !!isActive;

    if (username !== undefined && username !== '' && username !== existing.username) {
      if (existing.username) {
        return NextResponse.json({ error: 'Username tidak bisa diubah' }, { status: 400 });
      }
      const invalid = checkUsername(username);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      const login = String(username).trim();
      if (await usernameTaken(login, id)) {
        return NextResponse.json({ error: 'Username sudah dipakai' }, { status: 409 });
      }
      data.username = login;
    }

    // Logged as changes below, so the hash is added after that list is taken.
    const changes = { ...data, ...(password ? { password: 'diganti' } : {}) };
    if (password !== undefined && password !== '') {
      const invalid = checkPassword(password);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      data.password = await bcrypt.hash(password, 10);
    }

    const technician = await prisma.technician.update({ where: { id }, data, select: TECHNICIAN_PUBLIC_SELECT });

    await logActivity({
      userId: authCheck.userId,
      username: (authCheck.session.user as any)?.username || 'Admin',
      userRole: (authCheck.session.user as any)?.role,
      action: 'UPDATE_TECHNICIAN',
      description: `Memperbarui akun teknisi: ${existing.name}`,
      module: 'user',
      status: 'success',
      request: req,
      metadata: { technicianId: id, changes },
    });

    return NextResponse.json({ success: true, technician: toPublicTechnician(technician) });
  } catch (error) {
    console.error('Update technician error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - remove a technician account
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission('users.delete');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { id } = await params;

    const existing = await prisma.technician.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Teknisi tidak ditemukan' }, { status: 404 });
    }

    await prisma.technician.delete({ where: { id } });

    await logActivity({
      userId: authCheck.userId,
      username: (authCheck.session.user as any)?.username || 'Admin',
      userRole: (authCheck.session.user as any)?.role,
      action: 'DELETE_TECHNICIAN',
      description: `Menghapus akun teknisi: ${existing.name}`,
      module: 'user',
      status: 'success',
      request: req,
      metadata: { technicianId: id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete technician error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
