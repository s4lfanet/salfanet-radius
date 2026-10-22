import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/server/db/client';
import { TECH_JWT_SECRET } from '@/server/auth/technician-secret';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { getUploadDir } from '@/lib/upload-dir';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

async function verifyTechnician(req: NextRequest) {
  const token = req.cookies.get('technician-token')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, TECH_JWT_SECRET);
    if (payload.type === 'admin_user') {
      const adminUser = await prisma.adminUser.findUnique({
        where: { id: payload.id as string },
        select: { id: true, name: true, isActive: true, role: true },
      });
      if (!adminUser?.isActive || adminUser.role !== 'TECHNICIAN') return null;
      return { id: adminUser.id, name: adminUser.name ?? '' };
    }
    const tech = await prisma.technician.findUnique({
      where: { id: payload.id as string },
      select: { id: true, name: true, isActive: true },
    });
    return tech?.isActive ? tech : null;
  } catch {
    return null;
  }
}

// Extension comes from the checked image type, never from the client's file
// name, so a file named x.html cannot be stored as a page on this domain.
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// Where each kind of photo goes. Ticket photos and the KTP/installation
// photos from the register form; the latter used the admin upload API, which
// refused technicians.
const TARGETS: Record<string, string[]> = {
  ticket: ['tickets'],
  idCard: ['pppoe-customers', 'id-cards'],
  installation: ['pppoe-customers', 'installations'],
};

export async function POST(req: NextRequest) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const target = TARGETS[String(formData.get('type') || 'ticket')];

    if (!file) {
      return NextResponse.json({ success: false, error: 'File tidak ditemukan' }, { status: 400 });
    }

    if (!target) {
      return NextResponse.json({ success: false, error: 'Jenis upload tidak dikenal' }, { status: 400 });
    }

    const ext = EXT_BY_TYPE[file.type];
    if (!ext) {
      return NextResponse.json({ success: false, error: 'Hanya file gambar (JPG, PNG, WebP) yang diperbolehkan' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: 'Ukuran file maksimal 5MB' }, { status: 400 });
    }

    // Persistent upload dir (served by nginx at /uploads/), not public/ inside
    // the build, where files were not served and were lost on every deploy.
    const filename = `${randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(getUploadDir(...target), filename), buffer);

    return NextResponse.json({ success: true, url: `/uploads/${target.join('/')}/${filename}` });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ success: false, error: 'Gagal mengupload file' }, { status: 500 });
  }
}
