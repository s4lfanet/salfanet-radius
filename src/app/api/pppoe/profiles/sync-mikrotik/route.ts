import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { RouterOSAPI } from 'node-routeros';

const CMD_TIMEOUT = 12_000; // 12 seconds per command

/** Wraps api.write with per-command timeout + error capture (same pattern as vpn-server/setup) */
async function apiCmd(api: any, command: string, params: string[] = [], label = command): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const data = await Promise.race([
      api.write(command, params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Command timeout (${CMD_TIMEOUT / 1000}s): ${label}`)), CMD_TIMEOUT)
      ),
    ]);
    // Check if RouterOS returned a !trap (error) in the response data
    if (Array.isArray(data)) {
      const trap = data.find((item: any) => item['!trap'] || (item['message'] && item['type'] === 'error'));
      if (trap) {
        return { ok: false, error: trap['message'] || trap['!trap'] || JSON.stringify(trap) };
      }
    }
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
// GET - List all active routers (for picker UI)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const routers = await prisma.router.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nasname: true, ipAddress: true, shortname: true, description: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ routers });
  } catch (error) {
    console.error('Get routers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Test connection to a router (diagnostic — tests identity + PPP read/write access)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { routerId } = await request.json();
    const router = routerId
      ? await prisma.router.findUnique({ where: { id: routerId } })
      : await prisma.router.findFirst({ where: { isActive: true } });

    if (!router) return NextResponse.json({ error: 'Router tidak ditemukan' }, { status: 404 });

    const host = router.ipAddress || router.nasname;
    const portsToTry = [router.port || 8728, router.apiPort || 8729].filter((p, i, arr) => arr.indexOf(p) === i);

    type PortResult = {
      port: number; success: boolean; identity?: string;
      pppRead?: boolean; pppReadError?: string;
      pppWrite?: boolean; pppWriteError?: string;
      error?: string;
    };
    const results: PortResult[] = [];

    for (const port of portsToTry) {
      const api = new RouterOSAPI({ host, port, user: router.username, password: router.password, timeout: 10 });
      const r: PortResult = { port, success: false };
      try {
        await Promise.race([
          api.connect(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout 10s`)), 10000)),
        ]);

        // Test 1: identity
        const identity = await api.write('/system/identity/print');
        r.identity = identity[0]?.name || 'unknown';
        r.success = true;

        // Test 2: PPP profile read
        try {
          const profiles = await api.write('/ppp/profile/print');
          r.pppRead = true;
          r.pppReadError = `OK (${Array.isArray(profiles) ? profiles.length : '?'} profiles)`;
        } catch (e: any) {
          r.pppRead = false;
          r.pppReadError = e?.message || String(e);
        }

        // Test 3: PPP profile write (try to add then immediately remove a test profile)
        const testProfileName = `__salfanet_test_${Date.now()}`;
        try {
          const addResult = await api.write('/ppp/profile/add', [`=name=${testProfileName}`]);
          // If add succeeded, clean up
          try {
            const testProfile = await api.write('/ppp/profile/print');
            const found = Array.isArray(testProfile) ? testProfile.find((p: any) => p['name'] === testProfileName) : null;
            if (found) await api.write('/ppp/profile/remove', [`=.id=${found['.id']}`]);
          } catch { /* ignore cleanup error */ }
          r.pppWrite = true;
          r.pppWriteError = 'OK';
        } catch (e: any) {
          r.pppWrite = false;
          r.pppWriteError = e?.message || String(e);
        }

        await api.close();
      } catch (e: any) {
        try { await api.close(); } catch { /* ignore */ }
        r.error = e?.message || String(e);
      }
      results.push(r);
    }

    const bestResult = results.find(r => r.success);
    const anySuccess = !!bestResult;

    let hint: string | null = null;
    if (!anySuccess) {
      hint = `Tidak bisa konek ke ${host}.\nPastikan:\n1. /ip service api enabled=yes di MikroTik\n2. Port ${portsToTry.join('/')} tidak diblokir firewall\n3. IP dan kredensial benar`;
    } else if (bestResult && !bestResult.pppRead) {
      hint = `Koneksi berhasil tapi tidak bisa baca /ppp/profile.\nPastikan user "${router.username}" di MikroTik ada di group dengan policy=read,write,api`;
    } else if (bestResult && !bestResult.pppWrite) {
      hint = `Bisa baca tapi tidak bisa menulis /ppp/profile.\nPastikan user "${router.username}" di MikroTik ada di group dengan policy=write`;
    }

    return NextResponse.json({
      success: anySuccess,
      host,
      user: router.username,
      routerName: router.name || router.nasname,
      results,
      hint,
    }, { status: anySuccess ? 200 : 502 });
  } catch (error) {
    console.error('Test router error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, routerId, ipPoolName, localAddress, poolRanges } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const profile = await prisma.pppoeProfile.findUnique({ where: { id } }) as any;
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const rateLimit = profile.rateLimit || `${profile.downloadSpeed}M/${profile.uploadSpeed}M`;
    const resolvedMikrotikProfileName = String(profile.groupName || profile.name).trim();
    const resolvedIpPoolName = typeof ipPoolName === 'string' ? ipPoolName.trim() : (profile.ipPoolName || '');
    const resolvedLocalAddress = typeof localAddress === 'string' ? localAddress.trim() : '';
    const resolvedPoolRanges = typeof poolRanges === 'string' ? poolRanges.trim() : '';

    if (!resolvedMikrotikProfileName) {
      return NextResponse.json({ error: 'Nama PPP Profile MikroTik wajib diisi' }, { status: 400 });
    }

    // Get router — use specified router or first active router
    const router = routerId
      ? await prisma.router.findUnique({ where: { id: routerId } })
      : await prisma.router.findFirst({ where: { isActive: true } });

    if (!router) {
      return NextResponse.json({ error: 'Tidak ada router aktif ditemukan. Tambahkan router di menu NAS/Router terlebih dahulu.' }, { status: 404 });
    }

    const host = router.ipAddress || router.nasname;
    const primaryPort = router.port || 8728;
    const fallbackPort = router.apiPort || 8729;

    const connectAndSync = async (port: number): Promise<{ port: number; action: string; profileName: string; debug: string[]; warnings: string[] }> => {
      const api = new RouterOSAPI({
        host,
        port,
        user: router.username,
        password: router.password,
        timeout: 15,
      });

      const debug: string[] = [];
      const warnings: string[] = [];

      await Promise.race([
        api.connect(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Connection timed out (15s) to ${host}:${port}`)), 15000)),
      ]);
      debug.push(`✅ Connected to ${host}:${port} (user: ${router.username})`);

      try {
        // STEP 1: Ensure IP pool exists (create if needed) before touching PPP profile
        if (resolvedIpPoolName) {
          const poolPrintResult = await apiCmd(api, '/ip/pool/print', [], 'pool/print');
          if (!poolPrintResult.ok) throw new Error(`Gagal baca daftar pool: ${poolPrintResult.error}`);

          const allPools: any[] = poolPrintResult.data || [];
          const existingPool = allPools.find((p: any) => p['name'] === resolvedIpPoolName);
          debug.push(`🏊 Pools di MikroTik: ${allPools.length}, target: "${resolvedIpPoolName}", exists: ${!!existingPool}`);

          if (!existingPool) {
            if (!resolvedPoolRanges) {
              throw new Error(
                `Pool "${resolvedIpPoolName}" tidak ditemukan di MikroTik. ` +
                `Isi kolom "IP Range Pool" di modal untuk membuat pool baru secara otomatis.`
              );
            }
            debug.push(`➕ Membuat pool "${resolvedIpPoolName}" dengan ranges="${resolvedPoolRanges}"`);
            const createPoolResult = await apiCmd(
              api, '/ip/pool/add',
              [`=name=${resolvedIpPoolName}`, `=ranges=${resolvedPoolRanges}`],
              'pool/add'
            );
            if (!createPoolResult.ok) throw new Error(`Gagal buat pool "${resolvedIpPoolName}": ${createPoolResult.error}`);
            debug.push(`✅ Pool "${resolvedIpPoolName}" berhasil dibuat`);
            warnings.push(`Pool "${resolvedIpPoolName}" (${resolvedPoolRanges}) dibuat otomatis di MikroTik`);
          } else {
            debug.push(`✅ Pool "${resolvedIpPoolName}" sudah ada, skip buat pool`);
          }
        }

        // STEP 2: Create/update PPP profile
        const printResult = await apiCmd(api, '/ppp/profile/print', [], 'profile/print');
        if (!printResult.ok) throw new Error(`Gagal baca profile list: ${printResult.error}`);

        const allProfiles: any[] = printResult.data || [];
        const existingProfile = allProfiles.find((p: any) => p['name'] === resolvedMikrotikProfileName);
        debug.push(`📋 Profiles di MikroTik: ${allProfiles.length}, target: "${resolvedMikrotikProfileName}", exists: ${!!existingProfile}`);

        const sharedUserLimit = profile.sharedUser ? 'no' : 'yes';

        let action: string;

        if (existingProfile) {
          const profileId = existingProfile['.id'];
          debug.push(`🔄 Update existing profile id=${profileId}`);
          const updateParams: string[] = [`=.id=${profileId}`, `=rate-limit=${rateLimit}`, `=only-one=${sharedUserLimit}`];
          if (resolvedIpPoolName) updateParams.push(`=remote-address=${resolvedIpPoolName}`);
          if (resolvedLocalAddress) updateParams.push(`=local-address=${resolvedLocalAddress}`);
          debug.push(`📝 /ppp/profile/set: ${updateParams.join(' ')}`);
          const updateResult = await apiCmd(api, '/ppp/profile/set', updateParams, 'profile/set');
          if (!updateResult.ok) throw new Error(`Gagal update PPP profile: ${updateResult.error}`);
          action = 'updated';
        } else {
          debug.push(`➕ Creating new PPP profile`);
          const createParams: string[] = [`=name=${resolvedMikrotikProfileName}`, `=rate-limit=${rateLimit}`, `=only-one=${sharedUserLimit}`];
          if (resolvedIpPoolName) createParams.push(`=remote-address=${resolvedIpPoolName}`);
          if (resolvedLocalAddress) createParams.push(`=local-address=${resolvedLocalAddress}`);
          debug.push(`📝 /ppp/profile/add: ${createParams.join(' ')}`);
          const createResult = await apiCmd(api, '/ppp/profile/add', createParams, 'profile/add');
          if (!createResult.ok) throw new Error(`Gagal buat PPP profile: ${createResult.error}`);
          action = 'created';
        }

        await api.close();
        return { port, action, profileName: resolvedMikrotikProfileName, debug, warnings };
      } catch (e) {
        try { await api.close(); } catch { /* ignore */ }
        throw e;
      }
    };

    let syncResult: { port: number; action: string; profileName: string; debug: string[]; warnings: string[] };
    try {
      try {
        syncResult = await connectAndSync(primaryPort);
      } catch (e1: any) {
        if (fallbackPort === primaryPort) throw e1;
        console.warn(`[SyncMikroTik] Port ${primaryPort} gagal (${e1?.message}), coba port ${fallbackPort}...`);
        syncResult = await connectAndSync(fallbackPort);
      }

      // Save sync config to DB (non-critical)
      try {
        await prisma.pppoeProfile.update({
          where: { id },
          data: {
            mikrotikProfileName: resolvedMikrotikProfileName,
            ipPoolName: resolvedIpPoolName || null,
            localAddress: resolvedLocalAddress || null,
            lastRouterId: router.id,
          },
        } as any);
      } catch (dbErr: any) {
        console.warn('[SyncMikroTik] DB update gagal (mungkin migrasi belum dijalankan):', dbErr?.message);
      }

      const actionLabel = syncResult.action === 'created' ? 'dibuat' : 'diperbarui';
      const warningText = syncResult.warnings.length ? `\n\n⚠️ Peringatan:\n${syncResult.warnings.join('\n')}` : '';
      return NextResponse.json({
        success: true,
        message: `✅ PPP Profile "${resolvedMikrotikProfileName}" berhasil ${actionLabel} di MikroTik ${host}:${syncResult.port}${resolvedIpPoolName ? ` | Pool: ${resolvedIpPoolName}` : ''}${resolvedLocalAddress ? ` | Local IP: ${resolvedLocalAddress}` : ''}${warningText}`,
        debug: syncResult.debug,
        warnings: syncResult.warnings,
        router: { id: router.id, name: router.name || router.nasname, ip: host, port: syncResult.port },
      });
    } catch (mkError: any) {
      const errMsg = mkError?.message || String(mkError);
      console.error('[SyncMikroTik] MikroTik API error:', errMsg);
      return NextResponse.json({
        error: `Gagal sync ke MikroTik (${host}): ${errMsg}`,
        host,
        portsAttempted: [primaryPort, fallbackPort !== primaryPort ? fallbackPort : null].filter(Boolean),
      }, { status: 502 });
    }
  } catch (error) {
    console.error('Sync MikroTik error:', error);
    return NextResponse.json({ error: 'Gagal sinkronisasi ke MikroTik' }, { status: 500 });
  }
}
