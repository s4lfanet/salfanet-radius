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
 *   - interfaceName: string  (mis. "gpon-onu_0/1/2:3") — wajib
 *   - description?:   string
 *   - tcontProfile?:  string  (mis. "1G")
 *   - primaryVlan?:   number  (VLAN service-port 1)
 *   - secondaryVlan?: number  (VLAN service-port 2, opsional)
 *
 * Catatan: endpoint ini menimpa config T-CONT/GEM/service-port yang ada.
 * Tidak mengubah PPPoE/WiFi/TR-069 — gunakan register ulang atau GenieACS
 * untuk perubahan layer-2/layer-3 yang lebih dalam.
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
      interfaceName,
      description,
      tcontProfile,
      primaryVlan,
      secondaryVlan,
    } = body as {
      interfaceName?: string;
      description?: string;
      tcontProfile?: string;
      primaryVlan?: number;
      secondaryVlan?: number;
    };

    if (!interfaceName || !/^[a-zA-Z0-9_/-]+:\d+$/.test(interfaceName)) {
      return NextResponse.json(
        { error: 'interfaceName wajib diisi (format: gpon-onu_0/1/2:3)' },
        { status: 400 }
      );
    }

    const olt = await prisma.networkOLT.findUnique({ where: { id: oltId } });
    if (!olt) {
      return NextResponse.json({ error: 'OLT tidak ditemukan' }, { status: 404 });
    }
    if (!olt.telnetEnabled || !olt.username || !olt.password) {
      return NextResponse.json(
        { error: 'Telnet OLT tidak diaktifkan atau kredensial belum diisi' },
        { status: 400 }
      );
    }

    const telnetConfig = {
      host: olt.ipAddress,
      port: olt.telnetPort ?? 23,
      username: olt.username,
      password: olt.password,
      timeout: 30000,
    };

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

    const result = await executeMultipleCommands(telnetConfig, commands, {
      sendEnd: false,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Gagal eksekusi command OLT' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
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
