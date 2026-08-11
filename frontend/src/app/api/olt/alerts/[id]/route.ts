import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';

// PUT - Resolve an alert
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

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
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id } = await params;

    await prisma.oltAlert.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[OLT Alert DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete alert', details: error.message }, { status: 500 });
  }
}
