import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requirePermission } from '@/server/middleware/api-auth';
import { logActivity } from '@/server/services/activity-log.service';

function normalizePhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return '62' + digits.substring(1);
  return '62' + digits;
}

// GET - list all technicians (the OTP-login `technician` model used by the
// /technician/* portal — separate from adminUser accounts with role=TECHNICIAN)
export async function GET() {
  const authCheck = await requirePermission('users.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const technicians = await prisma.technician.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        isActive: true,
        requireOtp: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ technicians });
  } catch (error) {
    console.error('List technicians error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - admin pre-registers a technician (in addition to the existing
// self-service path where a technician is auto-created on their first
// request-otp call — this lets admin onboard one ahead of time, or note
// who's expected, without waiting for that self-registration).
export async function POST(req: NextRequest) {
  const authCheck = await requirePermission('users.create');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { name, phoneNumber, email, requireOtp } = await req.json();

    if (!name || !phoneNumber) {
      return NextResponse.json({ error: 'Nama dan nomor telepon wajib diisi' }, { status: 400 });
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
        requireOtp: requireOtp !== undefined ? !!requireOtp : true,
        isActive: true,
      },
    });

    await logActivity({
      userId: authCheck.userId,
      username: (authCheck.session.user as any)?.username || 'Admin',
      userRole: (authCheck.session.user as any)?.role,
      action: 'CREATE_TECHNICIAN',
      description: `Membuat akun teknisi: ${name} (${formattedPhone})`,
      module: 'user',
      status: 'success',
      request: req,
      metadata: { technicianId: technician.id, phoneNumber: formattedPhone },
    });

    return NextResponse.json({ success: true, technician });
  } catch (error) {
    console.error('Create technician error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
