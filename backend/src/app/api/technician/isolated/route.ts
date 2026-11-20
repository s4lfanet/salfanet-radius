import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import {
  getConnectivitySnapshot,
  loadPaymentStatus,
  TECH_CUSTOMER_SELECT,
} from '@/server/services/technician/connectivity.service';

export const dynamic = 'force-dynamic';

async function verifyTechnician(req: NextRequest) {
  const token = req.cookies.get('technician-token')?.value;
  if (!token) return null;
  try {
    const secret = TECH_JWT_SECRET;
    const { payload } = await jwtVerify(token, secret);
    if (payload.type === 'admin_user') {
      const adminUser = await prisma.adminUser.findUnique({
        where: { id: payload.id as string },
        select: { id: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') return null;
      return { id: adminUser.id, isActive: true };
    }
    const tech = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: { id: true, isActive: true },
    });
    return tech?.isActive ? tech : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Isolated/suspended customers with their unpaid invoices and full record.
  const users = await prisma.pppoeUser.findMany({
    where: { status: { in: ['isolated', 'suspended'] } },
    select: {
      ...TECH_CUSTOMER_SELECT,
      invoices: {
        where: { status: { in: ['PENDING', 'OVERDUE'] } },
        select: { id: true, invoiceNumber: true, amount: true, dueDate: true, status: true },
        orderBy: { dueDate: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Online = same rule as the Online page (RADIUS + live router sessions).
  const snap = await getConnectivitySnapshot();
  const payment = await loadPaymentStatus(users.map((u) => u.id));

  const data = users.map((u) => {
    const { invoices, ...customer } = u;
    const live = snap.sessions.get(u.username);
    const routerDown = !live && !!u.routerId && snap.unreachableRouterIds.includes(u.routerId);
    return {
      id: u.id,
      username: u.username,
      name: u.name,
      phone: u.phone,
      status: u.status,
      profileName: u.profile?.name ?? '-',
      profilePrice: u.profile?.price ?? 0,
      totalUnpaid: invoices.reduce((sum, inv) => sum + inv.amount, 0),
      unpaidInvoicesCount: invoices.length,
      isOnline: !!live,
      connection: live ? 'online' : routerDown ? 'unknown' : 'offline',
      source: live?.source ?? null,
      ipAddress: live?.ip ?? null,
      areaName: u.area?.name ?? null,
      routerName: u.router?.name ?? null,
      expiredAt: u.expiredAt,
      unpaidInvoices: invoices,
      customer: { ...customer, paymentStatus: payment.get(u.id) ?? 'paid' },
    };
  });

  const stats = {
    totalIsolated: data.length,
    totalOnline: data.filter((d) => d.connection === 'online').length,
    totalOffline: data.filter((d) => d.connection === 'offline').length,
    totalUnknown: data.filter((d) => d.connection === 'unknown').length,
    totalUnpaidAmount: data.reduce((sum, d) => sum + d.totalUnpaid, 0),
  };

  return NextResponse.json({ success: true, data, stats, unreachableRouters: snap.unreachableRouters });
}
