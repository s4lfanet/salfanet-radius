import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { logActivity } from '@/server/services/activity-log.service';

// PATCH - update a technician: activate/deactivate, toggle requireOtp, edit name/email
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission('users.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { id } = await params;
    const { name, email, isActive, requireOtp } = await req.json();

    const existing = await prisma.technician.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Teknisi tidak ditemukan' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email || null;
    if (isActive !== undefined) data.isActive = !!isActive;
    if (requireOtp !== undefined) data.requireOtp = !!requireOtp;

    const technician = await prisma.technician.update({ where: { id }, data });

    await logActivity({
      userId: authCheck.userId,
      username: (authCheck.session.user as any)?.username || 'Admin',
      userRole: (authCheck.session.user as any)?.role,
      action: 'UPDATE_TECHNICIAN',
      description: `Memperbarui akun teknisi: ${existing.name}`,
      module: 'user',
      status: 'success',
      request: req,
      metadata: { technicianId: id, changes: data },
    });

    return NextResponse.json({ success: true, technician });
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
