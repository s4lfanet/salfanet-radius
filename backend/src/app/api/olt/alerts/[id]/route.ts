import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';

// PUT - Resolve an alert
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission('network.edit');
  if (!authCheck.authorized) return authCheck.response;
  const session = authCheck.session;

  try {
    const { id } = await params;

    const alert = await prisma.oltAlert.findUnique({ where: { id } });
    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    const updated = await prisma.oltAlert.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: (session as any).user?.email ?? 'unknown',
      },
    });

    return NextResponse.json({ success: true, alert: updated });
  } catch (error: any) {
    console.error('[OLT Alert PUT]', error);
    return NextResponse.json({ error: 'Failed to resolve alert', details: error.message }, { status: 500 });
  }
}

// DELETE - Delete an alert
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission('network.edit');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { id } = await params;

    await prisma.oltAlert.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[OLT Alert DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete alert', details: error.message }, { status: 500 });
  }
}
