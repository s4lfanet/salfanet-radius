import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
const RouterOSAPI = require('node-routeros').RouterOSAPI;
import { prisma } from '@/server/db/client';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { routerIds } = body;

    if (!routerIds || !Array.isArray(routerIds)) {
      return NextResponse.json(
        { error: 'Router IDs array is required' },
        { status: 400 }
      );
    }

    // Get routers from database
    const routers = await prisma.router.findMany({
      where: {
        id: { in: routerIds },
      },
    });

    // Check status for each router
    const statusMap: Record<string, { online: boolean; identity?: string; uptime?: string }> = {};

    await Promise.all(
      routers.map(async (router) => {
        try {
          const conn = new RouterOSAPI({
            host: router.ipAddress,
            user: router.username,
            password: router.password,
            port: router.port || 8728,
            timeout: 5,
            tls: false,
          });

          await conn.connect();

          // Get router identity and uptime
          let identity = null;
          let resource = null;
          
          try {
            identity = await conn.write('/system/identity/print');
          } catch (e) {
            console.log('Identity check failed:', e);
          }
          
          try {
            resource = await conn.write('/system/resource/print');
          } catch (e) {
            console.log('Resource check failed:', e);
          }

          try {
            conn.close();
          } catch (e) {
            // Ignore close errors
          }

          statusMap[router.id] = {
            online: true,
            identity: identity?.[0]?.name || identity?.[0]?.['name'] || 'Unknown',
            uptime: resource?.[0]?.uptime || resource?.[0]?.['uptime'] || 'Unknown',
          };
        } catch (error: any) {
          console.error(`Router ${router.name} (${router.ipAddress}) status check failed:`, error.message || error.errno);
          statusMap[router.id] = {
            online: false,
          };
        }
      })
    );

    return NextResponse.json({ statusMap });
  } catch (error) {
    console.error('Check router status error:', error);
    return NextResponse.json(
      { error: 'Failed to check router status' },
      { status: 500 }
    );
  }
}
