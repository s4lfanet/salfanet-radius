import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { RouterOSAPI } from 'node-routeros';

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

// PUT - Test connection to a router (diagnostic)
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
    const results: { port: number; success: boolean; identity?: string; error?: string }[] = [];

    for (const port of portsToTry) {
      const api = new RouterOSAPI({ host, port, user: router.username, password: router.password, timeout: 8 });
      try {
        await Promise.race([
          api.connect(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout 8s`)), 8000)),
        ]);
        const identity = await api.write('/system/identity/print');
        await api.close();
        results.push({ port, success: true, identity: identity[0]?.name || 'unknown' });
      } catch (e: any) {
        try { await api.close(); } catch { /* ignore */ }
        results.push({ port, success: false, error: e?.message || String(e) });
      }
    }

    const anySuccess = results.some(r => r.success);
    return NextResponse.json({
      success: anySuccess,
      host,
      user: router.username,
      routerName: router.name || router.nasname,
      results,
      hint: anySuccess ? null : `Pastikan:\n1. /ip service api enable=yes di MikroTik\n2. Firewall MikroTik izinkan port ${portsToTry.join(' atau ')} dari ${process.env.SERVER_IP || 'server ini'}\n3. IP ${host} dapat dijangkau dari server`,
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

    const { id, routerId, ipPoolName, localAddress } = await request.json();
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

    const connectAndSync = async (port: number) => {
      const api = new RouterOSAPI({
        host,
        port,
        user: router.username,
        password: router.password,
        timeout: 15,
      });

      await Promise.race([
        api.connect(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Connection timed out (15s) to ${host}:${port}`)), 15000)),
      ]);

      try {
        // Fetch all profiles and filter in JS — avoids RouterOS query syntax ambiguity
        const allProfiles = await api.write('/ppp/profile/print');
        const existingProfile = allProfiles.find((p: any) => p['name'] === resolvedMikrotikProfileName);

        const sharedUserLimit = profile.sharedUser ? 'no' : 'yes';

        if (existingProfile) {
          const profileId = existingProfile['.id'];
          const updateParams: string[] = [
            `=.id=${profileId}`,
            `=rate-limit=${rateLimit}`,
            `=only-one=${sharedUserLimit}`,
          ];
          if (resolvedIpPoolName) updateParams.push(`=remote-address=${resolvedIpPoolName}`);
          if (resolvedLocalAddress) updateParams.push(`=local-address=${resolvedLocalAddress}`);
          await api.write('/ppp/profile/set', updateParams);
        } else {
          const createParams: string[] = [
            `=name=${resolvedMikrotikProfileName}`,
            `=rate-limit=${rateLimit}`,
            `=only-one=${sharedUserLimit}`,
            '=use-encryption=default',
            '=change-tcp-mss=default',
          ];
          if (resolvedIpPoolName) createParams.push(`=remote-address=${resolvedIpPoolName}`);
          if (resolvedLocalAddress) createParams.push(`=local-address=${resolvedLocalAddress}`);
          await api.write('/ppp/profile/add', createParams);
        }

        await api.close();
        return port;
      } catch (e) {
        try { await api.close(); } catch { /* ignore */ }
        throw e;
      }
    };

    let usedPort = primaryPort;
    try {
      try {
        usedPort = await connectAndSync(primaryPort);
      } catch (e1: any) {
        if (fallbackPort === primaryPort) throw e1;
        console.warn(`[SyncMikroTik] Port ${primaryPort} gagal (${e1?.message}), coba port ${fallbackPort}...`);
        usedPort = await connectAndSync(fallbackPort);
      }

      // Save sync config to DB for 1-click re-sync (non-critical — don't fail sync if DB update fails)
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

      return NextResponse.json({
        success: true,
        message: `Profile "${profile.name}" berhasil di-sync ke MikroTik ${host}:${usedPort} dengan PPP Profile "${resolvedMikrotikProfileName}"${resolvedIpPoolName ? ` | Pool: "${resolvedIpPoolName}"` : ''}${resolvedLocalAddress ? ` | Local IP: "${resolvedLocalAddress}"` : ''}`,
        router: { id: router.id, name: router.name || router.nasname, ip: host, port: usedPort },
      });
    } catch (mkError: any) {
      const errMsg = mkError?.message || String(mkError);
      console.error('[SyncMikroTik] MikroTik API error:', errMsg);
      return NextResponse.json({
        error: `Gagal konek ke MikroTik.\n\nHost: ${host}\nPort dicoba: ${primaryPort}${fallbackPort !== primaryPort ? ` dan ${fallbackPort}` : ''}\nUser: ${router.username}\n\nError: ${errMsg}\n\n💡 Pastikan:\n- Port API MikroTik terbuka (firewall)\n- /ip service api enabled=yes\n- Kredensial username/password benar`,
        host,
        portsAttempted: [primaryPort, fallbackPort !== primaryPort ? fallbackPort : null].filter(Boolean),
      }, { status: 502 });
    }
  } catch (error) {
    console.error('Sync MikroTik error:', error);
    return NextResponse.json({ error: 'Gagal sinkronisasi ke MikroTik' }, { status: 500 });
  }
}
