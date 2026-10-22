import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyTechnician } from '@/server/auth/technician-auth';
import { logActivity } from '@/server/services/activity-log.service';

const inRange = (v: unknown, limit: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;

/**
 * PATCH { latitude, longitude }: a technician sets a customer's map point
 * from the field (picked on the map or read from the phone's GPS). Only the
 * coordinates change; the change is recorded under Log Aktivitas.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tech = await verifyTechnician(req);
  if (!tech) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const latitude = typeof body.latitude === 'string' ? Number(body.latitude) : body.latitude;
    const longitude = typeof body.longitude === 'string' ? Number(body.longitude) : body.longitude;

    if (!inRange(latitude, 90) || !inRange(longitude, 180)) {
      return NextResponse.json({ error: 'Koordinat tidak valid' }, { status: 400 });
    }
    if (latitude === 0 && longitude === 0) {
      return NextResponse.json({ error: 'Koordinat 0,0 tidak valid. Pilih titik di peta atau ambil dari GPS.' }, { status: 400 });
    }

    const before = await prisma.pppoeUser.findUnique({
      where: { id },
      select: { id: true, username: true, name: true, latitude: true, longitude: true },
    });
    if (!before) return NextResponse.json({ error: 'Pelanggan tidak ditemukan' }, { status: 404 });

    const lat = Number(latitude.toFixed(7));
    const lng = Number(longitude.toFixed(7));
    await prisma.pppoeUser.update({ where: { id }, data: { latitude: lat, longitude: lng } });

    await logActivity({
      userId: tech.id,
      username: tech.name,
      userRole: 'TECHNICIAN',
      action: 'UPDATE_CUSTOMER_LOCATION',
      description: `Memperbarui lokasi GPS ${before.name || before.username}: ${lat}, ${lng}`,
      module: 'pppoe',
      status: 'success',
      request: req,
      metadata: { customerId: id, from: { latitude: before.latitude, longitude: before.longitude }, to: { latitude: lat, longitude: lng } },
    });

    return NextResponse.json({ success: true, latitude: lat, longitude: lng });
  } catch (error) {
    console.error('Technician update location error:', error);
    return NextResponse.json({ error: 'Lokasi gagal disimpan' }, { status: 500 });
  }
}
