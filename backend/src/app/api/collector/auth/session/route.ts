import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { getCollectorScope, scopeFilterOptions, describeScope } from '@/server/auth/collector-scope';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('collector-token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, TECH_JWT_SECRET);

    if (payload.type !== 'admin_user' || payload.role !== 'collector') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }

    const user = await prisma.adminUser.findUnique({
      where: { id: payload.id as string },
      select: {
        id: true,
        name: true,
        username: true,
        phone: true,
        email: true,
        isActive: true,
        role: true,
        areaId: true,
        collectorRouterIds: true,
      },
    });

    if (!user || !user.isActive || user.role !== 'COLLECTOR') {
      return NextResponse.json({ error: 'User not found or inactive' }, { status: 404 });
    }

    const scope = await getCollectorScope(user.id);
    let area = null;
    if (user.areaId) {
      area = await prisma.pppoeArea.findUnique({
        where: { id: user.areaId },
        select: { id: true, name: true },
      });
    }

    return NextResponse.json({
      success: true,
      collector: {
        id: user.id,
        name: user.name,
        username: user.username,
        phoneNumber: user.phone || user.username,
        email: user.email,
        areaId: user.areaId,
        areaName: area?.name || null,
        routerIds: scope?.routerIds ?? [],
        scopeLabel: await describeScope(scope),
      },
      // Choices for the portal's Area / Router filter: what occurs among
      // this collector's customers.
      filters: scope ? await scopeFilterOptions(scope) : { areas: [], routers: [] },
    });
  } catch (error) {
    console.error('Get collector session error:', error);
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }
}
