import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requireAnyPermission } from '@/server/middleware/api-auth';

/** Active collectors, for choosing who took a payment. Name and username only. */
export async function GET() {
  const authCheck = await requireAnyPermission(['invoices.edit', 'keuangan.edit']);
  if (!authCheck.authorized) return authCheck.response;

  const collectors = await prisma.adminUser.findMany({
    where: { role: 'COLLECTOR', isActive: true },
    select: { id: true, name: true, username: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ collectors });
}
