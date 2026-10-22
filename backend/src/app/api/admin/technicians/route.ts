import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import bcrypt from 'bcryptjs';
import { logActivity } from '@/server/services/activity-log.service';
import { TECHNICIAN_PUBLIC_SELECT, toPublicTechnician, checkUsername, checkPassword, usernameTaken } from '@/server/services/technician-account.service';

function normalizePhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return '62' + digits.substring(1);
  return '62' + digits;
}

// GET - list all technicians (the `technician` model used by the /technician
// portal; older technician accounts from Admin & Role live in admin_users)
export async function GET() {
  const authCheck = await requirePermission('users.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const rows = await prisma.technician.findMany({
      orderBy: { createdAt: 'desc' },
      select: TECHNICIAN_PUBLIC_SELECT,
    });
    const technicians = rows.map(toPublicTechnician);

    return NextResponse.json({ technicians });
  } catch (error) {
    console.error('List technicians error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - add a technician with the username + password they sign in with.
export async function POST(req: NextRequest) {
  const authCheck = await requirePermission('users.create');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { name, phoneNumber, email, username, password } = await req.json();

    if (!name || !phoneNumber) {
      return NextResponse.json({ error: 'Nama dan nomor telepon wajib diisi' }, { status: 400 });
    }
    const invalid = checkUsername(username) || checkPassword(password);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    const login = String(username).trim();
    if (await usernameTaken(login)) {
      return NextResponse.json({ error: 'Username sudah dipakai' }, { status: 409 });
    }

    const formattedPhone = normalizePhone(phoneNumber);

    const existing = await prisma.technician.findUnique({ where: { phoneNumber: formattedPhone } });
    if (existing) {
      return NextResponse.json({ error: 'Nomor telepon sudah terdaftar sebagai teknisi' }, { status: 409 });
    }

    const technician = await prisma.technician.create({
      data: {
        name,
        phoneNumber: formattedPhone,
        email: email || null,
        username: login,
        password: await bcrypt.hash(password, 10),
        isActive: true,
      },
      select: TECHNICIAN_PUBLIC_SELECT,
    });

    await logActivity({
      userId: authCheck.userId,
      username: (authCheck.session.user as any)?.username || 'Admin',
      userRole: (authCheck.session.user as any)?.role,
      action: 'CREATE_TECHNICIAN',
      description: `Membuat akun teknisi: ${name} (@${login})`,
      module: 'user',
      status: 'success',
      request: req,
      metadata: { technicianId: technician.id, phoneNumber: formattedPhone },
    });

    return NextResponse.json({ success: true, technician: toPublicTechnician(technician) });
  } catch (error) {
    console.error('Create technician error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
