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

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, routerId } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const profile = await prisma.pppoeProfile.findUnique({ where: { id } });
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const rateLimit = profile.rateLimit || `${profile.downloadSpeed}M/${profile.uploadSpeed}M`;

    // Get router — use specified router or first active router
    const router = routerId
      ? await prisma.router.findUnique({ where: { id: routerId } })
      : await prisma.router.findFirst({ where: { isActive: true } });

    if (!router) {
      return NextResponse.json({ error: 'Tidak ada router aktif ditemukan. Tambahkan router di menu NAS/Router terlebih dahulu.' }, { status: 404 });
    }

    const api = new RouterOSAPI({
      host: router.ipAddress || router.nasname,
      port: router.port || 8728,
      user: router.username,
      password: router.password,
      timeout: 10,
    });

    try {
      await api.connect();

      // Check if PPP profile already exists
      const existingProfiles = await api.write('/ppp/profile/print', [
        `?name=${profile.groupName}`,
      ]);

      const sharedUserLimit = profile.sharedUser ? undefined : '1';

      if (existingProfiles && existingProfiles.length > 0) {
        // Update existing profile
        const profileId = existingProfiles[0]['.id'];
        const updateParams: string[] = [
          `=.id=${profileId}`,
          `=rate-limit=${rateLimit}`,
        ];
        if (sharedUserLimit) {
          updateParams.push(`=only-one=${sharedUserLimit}`);
        }
        await api.write('/ppp/profile/set', updateParams);
      } else {
        // Create new PPP profile
        const createParams: string[] = [
          `=name=${profile.groupName}`,
          `=rate-limit=${rateLimit}`,
          '=use-encryption=default',
          '=change-tcp-mss=default',
        ];
        if (sharedUserLimit) {
          createParams.push(`=only-one=${sharedUserLimit}`);
        }
        await api.write('/ppp/profile/add', createParams);
      }

      await api.close();

      return NextResponse.json({
        success: true,
        message: `Profile "${profile.name}" (${profile.groupName}) berhasil disinkronkan ke MikroTik ${router.ipAddress || router.nasname}`,
        router: { id: router.id, name: router.name || router.nasname, ip: router.ipAddress || router.nasname },
      });
    } catch (mkError: any) {
      try { await api.close(); } catch { /* ignore */ }
      console.error('MikroTik API error:', mkError);
      return NextResponse.json({
        error: `Gagal terhubung ke MikroTik: ${mkError?.message || mkError}`,
        router: { name: router.name || router.nasname, ip: router.ipAddress || router.nasname },
      }, { status: 502 });
    }
  } catch (error) {
    console.error('Sync MikroTik error:', error);
    return NextResponse.json({ error: 'Gagal sinkronisasi ke MikroTik' }, { status: 500 });
  }
}
