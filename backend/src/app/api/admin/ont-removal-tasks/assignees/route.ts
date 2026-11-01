import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';

export const dynamic = 'force-dynamic';

// GET - who a cabut ONT task can be given to: active technicians (both
// kinds of technician account) and active collectors.
export async function GET() {
  const authCheck = await requirePermission('customers.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const [adminTechs, fieldTechs, collectors] = await Promise.all([
      prisma.adminUser.findMany({ where: { role: 'TECHNICIAN', isActive: true }, select: { id: true, name: true, phone: true }, orderBy: { name: 'asc' } }),
      prisma.technician.findMany({ where: { isActive: true }, select: { id: true, name: true, phoneNumber: true }, orderBy: { name: 'asc' } }),
      prisma.adminUser.findMany({ where: { role: 'COLLECTOR', isActive: true }, select: { id: true, name: true, phone: true }, orderBy: { name: 'asc' } }),
    ]);
    return NextResponse.json({
      technicians: [
        ...adminTechs.map((t) => ({ id: t.id, name: t.name, phone: t.phone ?? '' })),
        ...fieldTechs.map((t) => ({ id: t.id, name: t.name, phone: t.phoneNumber ?? '' })),
      ],
      collectors: collectors.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? '' })),
    });
  } catch (error) {
    console.error('ONT removal assignees error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
