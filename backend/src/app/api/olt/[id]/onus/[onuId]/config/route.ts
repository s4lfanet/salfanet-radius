import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { executeMultipleCommands } from '@/lib/olt/telnet';

/**
 * POST /api/olt/[id]/onus/[onuId]/config
 *
 * Ubah nama dan/atau deskripsi ONU yang sudah terdaftar (ZTE C320-style).
 * Ini sengaja dibatasi hanya untuk `name`/`description` — perubahan
 * T-CONT/GEM/service-port/VLAN dilakukan lewat register ulang, bukan di sini.
 *
 * Body:
 *   - name?:        string
 *   - description?: string
 *   - commit?:      boolean (default false = dry-run preview saja)
 *
 * Safety:
 *   - Interface name dibangun dari DB record (frame/slot/port/onuId), bukan dari client.
 *   - Default dry-run: mengembalikan commands tanpa eksekusi.
 *   - commit:true baru eksekusi ke OLT.
 *   - Hanya untuk vendor ZTE (vendor lain butuh adapter sendiri).
 *   - Semua eksekusi dicatat ke oltMonitoringLog.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; onuId: string }> }
) {
  try {
    const authCheck = await requirePermission('network.edit');
    if (!authCheck.authorized) return authCheck.response;

    const { id: oltId, onuId } = await params;
    const body = await req.json();
    const {
      name,
      description,
      commit = false,
    } = body as {
      name?: string;
      description?: string;
      commit?: boolean;
    };

    if (!name && !description) {
      return NextResponse.json(
        { error: 'Isi nama atau deskripsi ONU terlebih dahulu' },
        { status: 400 }
      );
    }

    // Ambil OLT dan ONU dari DB — jangan percaya interfaceName dari client
    const [olt, onu] = await Promise.all([
      prisma.networkOLT.findUnique({ where: { id: oltId } }),
      prisma.oltOnuStatus.findFirst({ where: { id: onuId, oltId } }),
    ]);

    if (!olt) {
      return NextResponse.json({ error: 'OLT tidak ditemukan' }, { status: 404 });
    }
    if (!onu) {
      return NextResponse.json({ error: 'ONU tidak ditemukan' }, { status: 404 });
    }

    // ZTE-only guard
    const vendor = (olt.vendor ?? '').toLowerCase();
    if (vendor !== 'zte') {
      return NextResponse.json(
        { error: `Edit config ONU saat ini hanya didukung untuk ZTE. Vendor terdeteksi: ${olt.vendor ?? 'unknown'}` },
        { status: 400 }
      );
    }

    // Cek ONU sudah terdaftar (bukan auth_failed/unregistered)
    const status = String(onu.status ?? '').toLowerCase();
    if (status === 'auth_failed' || status === 'unregistered') {
      return NextResponse.json(
        { error: 'ONU belum terdaftar. Gunakan register terlebih dahulu.' },
        { status: 400 }
      );
    }

    if (!olt.telnetEnabled || !olt.username || !olt.password) {
      return NextResponse.json(
        { error: 'Telnet OLT tidak diaktifkan atau kredensial belum diisi' },
        { status: 400 }
      );
    }

    // Bangun interface name dari DB record.
    // DB port adalah zero-based (ZTE SNMP: pon - 1), CLI ZTE adalah one-based.
    const ponPort = onu.port + 1;
    const interfaceName = `gpon-onu_${onu.frame}/${onu.slot}/${ponPort}:${onu.onuId}`;

    const commands: string[] = ['configure terminal', `interface ${interfaceName}`];
    if (name) commands.push(`name ${name}`);
    if (description) commands.push(`description ${description}`);
    commands.push('exit', 'end', 'write');

    // Dry-run mode: kembalikan commands tanpa eksekusi
    if (!commit) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        interfaceName,
        commands,
        message: 'Preview command (dry-run). Kirim commit=true untuk eksekusi.',
      });
    }

    // Eksekusi ke OLT
    const telnetConfig = {
      host: olt.ipAddress,
      port: olt.telnetPort ?? 23,
      username: olt.username,
      password: olt.password,
      timeout: 30000,
    };

    const result = await executeMultipleCommands(telnetConfig, commands, {
      sendEnd: false,
    });

    // Log ke monitoring log
    await prisma.oltMonitoringLog.create({
      data: {
        id: crypto.randomUUID(),
        oltId,
        logType: 'command',
        severity: result.success ? 'info' : 'error',
        message: `ONU rename/description: ${onu.serialNumber ?? interfaceName} — ${result.success ? 'OK' : 'FAILED'}`,
        data: { commands, interfaceName, output: result.output?.slice(0, 2000), error: result.error },
      },
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Gagal eksekusi command OLT' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      interfaceName,
      commands,
      output: result.output,
    });
  } catch (error: unknown) {
    console.error('Edit ONU config error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
