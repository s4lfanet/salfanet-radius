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

    const { id, routerIds, routerId, ipPoolName, localAddress, poolRanges } = await request.json();
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

    // Resolve target routers: routerIds array (new), single routerId (legacy), or ALL active routers
    let targetIds: string[] | null = null;
    if (Array.isArray(routerIds) && routerIds.length > 0) {
      targetIds = routerIds;
    } else if (typeof routerId === 'string' && routerId) {
      targetIds = [routerId];
    }

    const routerList = targetIds
      ? await prisma.router.findMany({ where: { id: { in: targetIds }, isActive: true }, orderBy: { name: 'asc' } })
      : await prisma.router.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });

    if (routerList.length === 0) {
      return NextResponse.json({ error: 'Tidak ada router aktif ditemukan. Tambahkan router di menu NAS/Router terlebih dahulu.' }, { status: 404 });
    }

    const connectAndSync = async (router: typeof routerList[0]): Promise<{ routerId: string; routerName: string; success: boolean; action?: string; message?: string; error?: string; debug: string[]; warnings: string[] }> => {
      const host = router.ipAddress || router.nasname;
      const primaryPort = router.port || 8728;
      const fallbackPort = router.apiPort || 8729;

      const tryPort = async (port: number): Promise<{ port: number; action: string; profileName: string; debug: string[]; warnings: string[] }> => {
        const api = new RouterOSAPI({ host, port, user: router.username, password: router.password, timeout: 15 });
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
              const createPoolResult = await apiCmd(api, '/ip/pool/add', [`=name=${resolvedIpPoolName}`, `=ranges=${resolvedPoolRanges}`], 'pool/add');
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
            const updateResult = await apiCmd(api, '/ppp/profile/set', updateParams, 'profile/set');
            if (!updateResult.ok) throw new Error(`Gagal update PPP profile: ${updateResult.error}`);
            action = 'updated';
          } else {
            debug.push(`➕ Creating new PPP profile`);
            const createParams: string[] = [`=name=${resolvedMikrotikProfileName}`, `=rate-limit=${rateLimit}`, `=only-one=${sharedUserLimit}`];
            if (resolvedIpPoolName) createParams.push(`=remote-address=${resolvedIpPoolName}`);
            if (resolvedLocalAddress) createParams.push(`=local-address=${resolvedLocalAddress}`);
            const createResult = await apiCmd(api, '/ppp/profile/add', createParams, 'profile/add');
            if (!createResult.ok) throw new Error(`Gagal buat PPP profile: ${createResult.error}`);
            action = 'created';
          }

          // Verify local-address was stored
          if (resolvedLocalAddress) {
            const verifyResult = await apiCmd(api, '/ppp/profile/print', [`?name=${resolvedMikrotikProfileName}`], 'profile/verify');
            if (verifyResult.ok && Array.isArray(verifyResult.data)) {
              const storedProfile = verifyResult.data.find((p: any) => p['name'] === resolvedMikrotikProfileName);
              const storedLocalAddr = storedProfile?.['local-address'] || '';
              if (storedLocalAddr && storedLocalAddr !== '0.0.0.0') {
                debug.push(`✅ local-address tersimpan di MikroTik: ${storedLocalAddr}`);
              } else {
                warnings.push(`⚠️ local-address "${resolvedLocalAddress}" tidak tersimpan di PPP profile MikroTik.`);
                debug.push(`⚠️ local-address tidak tersimpan (tersimpan: "${storedLocalAddr || 'kosong'}")`);
              }
            }
          }

          await api.close();
          return { port, action, profileName: resolvedMikrotikProfileName, debug, warnings };
        } catch (e) {
          try { await api.close(); } catch { /* ignore */ }
          throw e;
        }
      };

      try {
        let syncResult: { port: number; action: string; profileName: string; debug: string[]; warnings: string[] };
        try {
          syncResult = await tryPort(primaryPort);
        } catch (e1: any) {
          if (fallbackPort === primaryPort) throw e1;
          syncResult = await tryPort(fallbackPort);
        }
        const actionLabel = syncResult.action === 'created' ? 'dibuat' : 'diperbarui';
        return {
          routerId: router.id,
          routerName: router.name || router.nasname,
          success: true,
          action: syncResult.action,
          message: `✅ ${router.name} (${host}:${syncResult.port}): profile "${resolvedMikrotikProfileName}" ${actionLabel}`,
          debug: syncResult.debug,
          warnings: syncResult.warnings,
        };
      } catch (e: any) {
        return {
          routerId: router.id,
          routerName: router.name || router.nasname,
          success: false,
          error: e?.message || String(e),
          debug: [],
          warnings: [],
        };
      }
    };

    // Sync to all target routers
    const results = await Promise.allSettled(routerList.map(r => connectAndSync(r)));
    const routerResults = results.map(r => r.status === 'fulfilled' ? r.value : { routerId: '', routerName: '', success: false, error: String((r as any).reason), debug: [], warnings: [] });

    const succeeded = routerResults.filter(r => r.success);
    const failed = routerResults.filter(r => !r.success);

    // Update DB with sync metadata (non-critical)
    // Split into two updates: core fields (guaranteed typed) + metadata (may need as any)
    try {
      // Step 1: always save core sync data — these fields are in the schema
      await prisma.pppoeProfile.update({
        where: { id },
        data: {
          mikrotikProfileName: resolvedMikrotikProfileName,
          ipPoolName: resolvedIpPoolName || null,
          localAddress: resolvedLocalAddress || null,
        },
      });
    } catch (dbErr: any) {
      console.warn('[SyncMikroTik] DB core update gagal:', dbErr?.message);
    }
    try {
      // Step 2: update metadata timestamps (use as any in case Prisma types are stale)
      if (succeeded.length > 0) {
        await (prisma.pppoeProfile as any).update({
          where: { id },
          data: {
            lastRouterId: succeeded[succeeded.length - 1].routerId,
            lastSyncAt: new Date(),
          },
        });
      }
    } catch { /* non-critical */ }

    const successLines = succeeded.map(r => r.message).join('\n');
    const failLines = failed.map(r => `❌ ${r.routerName}: ${r.error}`).join('\n');
    const summaryMessage = [
      succeeded.length > 0 ? `✅ Berhasil sync ke ${succeeded.length} router:\n${successLines}` : '',
      failed.length > 0 ? `\n❌ Gagal di ${failed.length} router:\n${failLines}` : '',
    ].filter(Boolean).join('');

    const allWarnings = routerResults.flatMap(r => r.warnings);
    const allDebug = routerResults.flatMap(r => r.debug.length ? [`--- ${r.routerName} ---`, ...r.debug] : []);

    return NextResponse.json({
      success: succeeded.length > 0,
      message: summaryMessage,
      results: routerResults,
      debug: allDebug,
      warnings: allWarnings,
      succeededCount: succeeded.length,
      failedCount: failed.length,
      // Return saved values so frontend can update local state immediately
      savedProfile: {
        ipPoolName: resolvedIpPoolName || null,
        localAddress: resolvedLocalAddress || null,
        mikrotikProfileName: resolvedMikrotikProfileName,
      },
    }, { status: succeeded.length > 0 ? 200 : 502 });
  } catch (error) {
    console.error('Sync MikroTik error:', error);
    return NextResponse.json({ error: 'Gagal sinkronisasi ke MikroTik' }, { status: 500 });
  }
}
