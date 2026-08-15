import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { ok, created, badRequest, unauthorized, notFound, conflict, serverError } from '@/lib/api-response';
import bcrypt from 'bcryptjs';
import { prisma } from '@/server/db/client';
import {
  listPppoeUsers,
  getPppoeUserById,
  createPppoeUser,
  updatePppoeUser,
  deletePppoeUser,
} from '@/server/services/pppoe.service';

// GET - List PPPoE users (server-side pagination, search, filter)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const users = await listPppoeUsers({
      status: searchParams.get('status'),
      search: searchParams.get('search'),
      profileId: searchParams.get('profileId'),
      routerId: searchParams.get('routerId'),
      areaId: searchParams.get('areaId'),
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : null,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : null,
      sortBy: searchParams.get('sortBy'),
      sortOrder: searchParams.get('sortOrder') as 'asc' | 'desc' | null,
    });
    return ok(users);
  } catch (error) {
    console.error('Get PPPoE users error:', error);
    return serverError();
  }
}

// POST - Create new PPPoE user
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    const { profileId, name, phone, pppoeCustomerId, noPppoeAccount } = body;
    if (!profileId) {
      return badRequest('Missing required field: profileId');
    }
    if (!noPppoeAccount && (!body.username || !body.password)) {
      return badRequest('Username dan password wajib diisi untuk akun PPPoE');
    }
    if (!pppoeCustomerId && (!name || !phone)) {
      return badRequest('Nama dan No. HP wajib diisi jika tidak menghubungkan ke pelanggan');
    }
    if (!body.idCardPhoto) {
      return badRequest('Foto KTP wajib diupload');
    }
    if (!body.latitude || !body.longitude) {
      return badRequest('GPS lokasi pelanggan wajib diisi');
    }

    const result = await createPppoeUser(body, session, request);
    return created({ success: true, ...result });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'DUPLICATE_USERNAME') return conflict(err.message!);
    if (err.code === 'NOT_FOUND') return notFound(err.message);
    console.error('Create PPPoE user error:', error);
    return serverError();
  }
}

// PUT - Update PPPoE user
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    if (!body.id) return badRequest('User ID is required');

    const user = await updatePppoeUser(body, session, request);
    return ok({ success: true, user });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'NOT_FOUND') return notFound(err.message);
    if (err.code === 'DUPLICATE_USERNAME') return conflict(err.message!);
    console.error('Update PPPoE user error:', error);
    return serverError();
  }
}

// DELETE - Remove PPPoE user (requires SUPER_ADMIN role + password confirmation)
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return badRequest('User ID is required');

    // Parse body for password confirmation
    let body: any = {};
    try {
      body = await request.json();
    } catch { body = {}; }

    const confirmPassword = body.confirmPassword;
    if (!confirmPassword) {
      return badRequest('Password superadmin wajib diisi untuk menghapus pelanggan.');
    }

    // Verify the logged-in admin's password
    const adminId = (session.user as any)?.id;
    if (!adminId) return unauthorized();

    const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) return unauthorized();

    // Only SUPER_ADMIN can delete customers
    if (admin.role !== 'SUPER_ADMIN') {
      return badRequest('Hanya Super Admin yang dapat menghapus pelanggan.');
    }

    const isValid = await bcrypt.compare(confirmPassword, admin.password);
    if (!isValid) {
      return badRequest('Password superadmin yang Anda masukkan salah. Hapus pelanggan dibatalkan.');
    }

    const result = await deletePppoeUser(id, session, request);
    return ok({ success: true, message: 'User deleted successfully', ...result });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'NOT_FOUND') return notFound(err.message);
    console.error('Delete PPPoE user error:', error);
    return serverError();
  }
}
