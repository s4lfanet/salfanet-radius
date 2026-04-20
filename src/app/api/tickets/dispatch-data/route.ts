import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const customerSearch = searchParams.get('customerSearch') || '';

    const [technicians, categories, routers, olts, odcs, odps, pppoeUsers, billingCustomers] = await Promise.all([
      prisma.technician.findMany({
        where: { isActive: true },
        select: { id: true, name: true, phoneNumber: true },
        orderBy: { name: 'asc' },
      }),
      prisma.ticketCategory.findMany({
        where: { isActive: true },
        select: { id: true, name: true, color: true },
        orderBy: { name: 'asc' },
      }),
      prisma.router.findMany({
        select: { id: true, name: true, nasname: true },
        orderBy: { name: 'asc' },
      }),
      prisma.networkOLT.findMany({
        select: { id: true, name: true, ipAddress: true, status: true },
        orderBy: { name: 'asc' },
      }),
      prisma.networkODC.findMany({
        select: { id: true, name: true, status: true, oltId: true },
        orderBy: { name: 'asc' },
      }),
      prisma.networkODP.findMany({
        select: { id: true, name: true, status: true, odcId: true, oltId: true, portCount: true },
        orderBy: { name: 'asc' },
      }),
      // Search pppoeUser (PPPoE accounts — has ODP assignment)
      customerSearch
        ? prisma.pppoeUser.findMany({
            where: {
              OR: [
                { username: { contains: customerSearch } },
                { name: { contains: customerSearch } },
                { phone: { contains: customerSearch } },
              ],
            },
            select: {
              id: true,
              username: true,
              name: true,
              phone: true,
              address: true,
              status: true,
              odpAssignment: {
                select: {
                  odpId: true,
                  odp: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: { name: 'asc' },
            take: 20,
          })
        : Promise.resolve([]),
      // Search pppoeCustomer (billing customers — may not have PPPoE account yet)
      customerSearch
        ? prisma.pppoeCustomer.findMany({
            where: {
              OR: [
                { name: { contains: customerSearch } },
                { phone: { contains: customerSearch } },
                { customerId: { contains: customerSearch } },
              ],
            },
            select: {
              id: true,
              customerId: true,
              name: true,
              phone: true,
              address: true,
              isActive: true,
              pppoeUsers: {
                select: { id: true },
                take: 1,
              },
            },
            orderBy: { name: 'asc' },
            take: 20,
          })
        : Promise.resolve([]),
    ]);

    // Merge: prefer pppoeUser results, add billingCustomers not already covered
    const pppoeUserIds = new Set(pppoeUsers.map((u: any) => u.id));
    // Billing customers linked to a pppoeUser (via pppoeUsers[0].id) that's already in results — skip
    const billingOnlyCustomers = billingCustomers
      .filter((c: any) => !c.pppoeUsers?.[0] || !pppoeUserIds.has(c.pppoeUsers[0].id))
      .map((c: any) => ({
        id: c.id,
        username: c.customerId, // Use display ID as username placeholder
        name: c.name,
        phone: c.phone,
        address: c.address,
        status: c.isActive ? 'active' : 'inactive',
        odpAssignment: null,
        _source: 'billing', // marker for frontend display
      }));

    const customers = [
      ...pppoeUsers.map((u: any) => ({ ...u, _source: 'pppoe' })),
      ...billingOnlyCustomers,
    ].slice(0, 30);

    return NextResponse.json({ technicians, categories, routers, olts, odcs, odps, customers });
  } catch (error) {
    console.error('[Dispatch Data] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch dispatch data' }, { status: 500 });
  }
}
