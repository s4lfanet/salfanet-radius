import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { executeCommand } from '@/lib/olt/telnet';
import { readHiosoPonOptical } from '@/lib/olt/hioso-telnet';
import { parseOpticalModule } from '@/lib/olt/zte-chassis';

/** GET /api/olt/[id]/pon-optical?slot=&port=: the optical module of one PON port, read live over Telnet. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authCheck = await requirePermission('network.view');
  if (!authCheck.authorized) return authCheck.response;

  try {
    const { id } = await params;
    const slot = Number(request.nextUrl.searchParams.get('slot'));
    const port = Number(request.nextUrl.searchParams.get('port'));
    if (!Number.isInteger(slot) || !Number.isInteger(port) || slot < 0 || port < 0) {
      return NextResponse.json({ error: 'slot dan port tidak valid' }, { status: 400 });
    }

    const olt = await prisma.networkOLT.findUnique({ where: { id } });
    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });
    if (!olt.telnetEnabled || !olt.username) {
      return NextResponse.json({ error: 'Aktifkan Telnet dan isi login OLT untuk membaca modul optik' }, { status: 400 });
    }

    const config = { host: olt.ipAddress, port: olt.telnetPort ?? 23, username: olt.username, password: olt.password ?? '' };
    const vendor = olt.vendor?.toLowerCase();

    if (vendor === 'hioso') {
      return NextResponse.json({ success: true, fields: await readHiosoPonOptical(config, olt.model, port) });
    }
    if (!vendor || vendor === 'zte') {
      // DB port is zero-based, the ZTE CLI one-based.
      const result = await executeCommand({ ...config, timeout: 15 }, `show interface optical-module-info gpon-olt_1/${slot}/${port + 1}`);
      if (!result.success) return NextResponse.json({ error: result.error ?? 'Telnet gagal' }, { status: 502 });
      return NextResponse.json({ success: true, fields: parseOpticalModule(result.output ?? '') });
    }
    return NextResponse.json({ error: `Modul optik belum didukung untuk ${olt.vendor}` }, { status: 400 });
  } catch (error: any) {
    console.error('[OLT PON Optical GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
