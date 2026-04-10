import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import { upsertTechnicianPushSubscription, upsertAdminPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { technicianId, subscription } = body;

    if (!technicianId || !subscription) {
      return NextResponse.json({ success: false, error: 'technicianId and subscription are required' }, { status: 400 });
    }

    // Detect if this is an admin_user (TECHNICIAN role) by verifying the JWT cookie
    const token = request.cookies.get('technician-token')?.value;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, TECH_JWT_SECRET);
        if (payload.type === 'admin_user') {
          // admin_user has no entry in technician table — save to adminPushSubscription instead
          const saved = await upsertAdminPushSubscription(
            String(payload.id),
            subscription,
            request.headers.get('user-agent'),
          );
          return NextResponse.json({ success: true, subscriptionId: saved.id });
        }
      } catch { /* invalid token — fall through to normal check */ }
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
