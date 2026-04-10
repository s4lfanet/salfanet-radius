import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import { removeTechnicianPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { technicianId, endpoint, subscription } = body;

    if (!technicianId) {
      return NextResponse.json({ success: false, error: 'technicianId is required' }, { status: 400 });
    }

    // Detect if this is an admin_user (TECHNICIAN role) by verifying the JWT cookie
    const token = request.cookies.get('technician-token')?.value;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, TECH_JWT_SECRET);
        if (payload.type === 'admin_user') {
          return NextResponse.json({ success: true, skipped: true });
        }
      } catch { /* invalid token — fall through to normal check */ }
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
