import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { removeTechnicianPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { technicianId, endpoint, subscription } = body;

    if (!technicianId) {
      return NextResponse.json({ success: false, error: 'technicianId is required' }, { status: 400 });
    }

    const technician = await prisma.technician.findUnique({
      where: { id: String(technicianId) },
      select: { id: true },
    });

    if (!technician) {
      return NextResponse.json({ success: false, error: 'Technician not found' }, { status: 404 });
    }

    const endpointUrl = endpoint || subscription?.endpoint;
    const deleted = await removeTechnicianPushSubscription(technician.id, endpointUrl);

    return NextResponse.json({ success: true, deleted });
  } catch (error: any) {
    console.error('[Technician Push Unsubscribe] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
