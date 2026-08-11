import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';

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

  // Get isolated/suspended users with unpaid invoices
  const users = await prisma.pppoeUser.findMany({
    where: { status: { in: ['isolated', 'suspended'] } },
    select: {
      id: true,
      username: true,
      name: true,
      phone: true,
      status: true,
      profile: { select: { name: true, price: true } },
      area: { select: { name: true } },
      invoices: {
        where: { status: { in: ['PENDING', 'OVERDUE'] } },
        select: { id: true, invoiceNumber: true, amount: true, dueDate: true, status: true },
        orderBy: { dueDate: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Check which are currently online
  const usernames = users.map((u) => u.username);
  const activeSessions = usernames.length
    ? await prisma.radacct.findMany({
        where: { username: { in: usernames }, acctstoptime: null },
        select: { username: true, framedipaddress: true },
      })
    : [];
  const onlineMap = new Map(activeSessions.map((s) => [s.username, s.framedipaddress]));

  const data = users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    phone: u.phone,
    status: u.status,
    profileName: u.profile?.name ?? '-',
    profilePrice: u.profile?.price ?? 0,
    totalUnpaid: u.invoices.reduce((sum, inv) => sum + inv.amount, 0),
    unpaidInvoicesCount: u.invoices.length,
    isOnline: onlineMap.has(u.username),
    ipAddress: onlineMap.get(u.username) ?? null,
    areaName: u.area?.name ?? null,
    unpaidInvoices: u.invoices,
  }));

  const stats = {
    totalIsolated: data.length,
    totalOnline: data.filter((d) => d.isOnline).length,
    totalOffline: data.filter((d) => !d.isOnline).length,
    totalUnpaidAmount: data.reduce((sum, d) => sum + d.totalUnpaid, 0),
  };

  return NextResponse.json({ success: true, data, stats });
}
