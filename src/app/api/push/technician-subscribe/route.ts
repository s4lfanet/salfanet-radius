import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { upsertTechnicianPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { technicianId, subscription } = body;

    if (!technicianId || !subscription) {
      return NextResponse.json({ success: false, error: 'technicianId and subscription are required' }, { status: 400 });
    }

    // Verify technician exists and is active
    const technician = await prisma.technician.findUnique({
      where: { id: String(technicianId) },
      select: { id: true, isActive: true },
    });

    if (!technician) {
      return NextResponse.json({ success: false, error: 'Technician not found' }, { status: 404 });
    }

    if (!technician.isActive) {
      return NextResponse.json({ success: false, error: 'Technician account is inactive' }, { status: 403 });
    }

    const saved = await upsertTechnicianPushSubscription(technician.id, subscription, request.headers.get('user-agent'));

    return NextResponse.json({ success: true, subscriptionId: saved.id });
  } catch (error: any) {
    console.error('[Technician Push Subscribe] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
