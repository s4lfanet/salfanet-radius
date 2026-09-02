import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import { checkAuth } from '@/server/middleware/api-auth';
import { removeTechnicianPushSubscription, removeAdminPushSubscription } from '@/server/services/push-notification.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { technicianId, endpoint, subscription } = body;

    // No technicianId — try admin auth (collector uses admin session)
    if (!technicianId) {
      const authCheck = await checkAuth();
      if (authCheck.authorized && authCheck.userId) {
        const endpointUrl = endpoint || subscription?.endpoint;
        const deleted = await removeAdminPushSubscription(authCheck.userId, endpointUrl);
        return NextResponse.json({ success: true, deleted });
      }
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    // Detect if this is an admin_user (TECHNICIAN role) by verifying the JWT cookie
    const token = request.cookies.get('technician-token')?.value;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, TECH_JWT_SECRET);
        if (payload.type === 'admin_user') {
          const endpointUrl = endpoint || subscription?.endpoint;
          const deleted = await removeAdminPushSubscription(String(payload.id), endpointUrl);
          return NextResponse.json({ success: true, deleted });
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
