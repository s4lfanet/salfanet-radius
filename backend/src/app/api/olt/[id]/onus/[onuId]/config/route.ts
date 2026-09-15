import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { executeMultipleCommands } from '@/lib/olt/telnet';

/**
 * POST /api/olt/[id]/onus/[onuId]/config
 *
 * Edit konfigurasi ONU yang sudah terdaftar (ZTE C320-style).
 * Mendukung: description/name, T-CONT profile, GEM port, service-port VLAN.
 *
 * Body:
 *   - description?:   string
 *   - tcontProfile?:  string  (mis. "1G")
 *   - primaryVlan?:   number  (VLAN service-port 1)
 *   - secondaryVlan?: number  (VLAN service-port 2, opsional)
 *   - commit?:        boolean (default false = dry-run preview saja)
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
      description,
      tcontProfile,
      primaryVlan,
      secondaryVlan,
      commit = false,
    } = body as {
      description?: string;
      tcontProfile?: string;
      primaryVlan?: number;
      secondaryVlan?: number;
      commit?: boolean;
    };

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

    // Validasi VLAN
    if (primaryVlan !== undefined) {
      if (isNaN(primaryVlan) || primaryVlan < 1 || primaryVlan > 4094) {
        return NextResponse.json(
          { error: 'Primary VLAN harus 1-4094' },
          { status: 400 }
        );
      }
    }
    if (secondaryVlan !== undefined && secondaryVlan !== null) {
      if (isNaN(secondaryVlan) || secondaryVlan < 1 || secondaryVlan > 4094) {
        return NextResponse.json(
          { error: 'Secondary VLAN harus 1-4094' },
          { status: 400 }
        );
      }
    }

    // Bangun command edit. Masuk ke config interface, hapus & rebuild
    // T-CONT + GEM + service-port agar idempoten.
    const commands: string[] = ['configure terminal', `interface ${interfaceName}`];

    if (description !== undefined && description !== '') {
      commands.push(`name ${description}`, `description ${description}`);
    }

    if (tcontProfile) {
      // Hapus T-CONT lama (1-2) lalu rebuild
      commands.push('no tcont 1', 'no tcont 2');
      const primaryName = primaryVlan
        ? `VLAN${String(primaryVlan).padStart(4, '0')}`
        : 'PRIMARY';
      commands.push(`tcont 1 name ${primaryName} profile ${tcontProfile}`);
      if (secondaryVlan) {
        const secondaryName = `VLAN${secondaryVlan}`;
        commands.push(`tcont 2 name ${secondaryName} profile ${tcontProfile}`);
      }
      commands.push('gemport 1 tcont 1');
      if (secondaryVlan) commands.push('gemport 2 tcont 2');
    }

    if (primaryVlan) {
      commands.push(
        `service-port 1 vport 1 user-vlan ${primaryVlan} vlan ${primaryVlan}`
      );
      if (secondaryVlan) {
        commands.push(
          `service-port 2 vport 2 user-vlan ${secondaryVlan} vlan ${secondaryVlan}`
        );
      }
    }

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
        message: `ONU config edit: ${onu.serialNumber ?? interfaceName} — ${result.success ? 'OK' : 'FAILED'}`,
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
