import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
const RouterOSAPI = require('node-routeros').RouterOSAPI;

/**
 * API untuk mendeteksi IP publik dari MikroTik
 * Mencari IP dari:
 * 1. Cloud DDNS jika aktif
 * 2. Interface WAN (pppoe-out, ether1, atau interface dengan gateway)
 * 3. IP yang digunakan untuk koneksi ke internet
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get router from database
    const router = await prisma.router.findUnique({
      where: { id },
    });

    if (!router) {
      return NextResponse.json({ error: 'Router not found' }, { status: 404 });
    }

    // Connect to MikroTik
    const conn = new RouterOSAPI({
      host: router.ipAddress,
      user: router.username,
      password: router.password,
      port: router.port || 8728,
      timeout: 10,
      tls: false,
    });

    await conn.connect();

    let publicIp: string | null = null;
    let detectionMethod = '';

    // Method 1: Check IP Cloud (DDNS)
    try {
      const cloud = await conn.write('/ip/cloud/print');
      if (cloud && cloud[0] && cloud[0]['public-address']) {
        publicIp = cloud[0]['public-address'];
        detectionMethod = 'IP Cloud DDNS';
      }
    } catch (e) {
      console.log('IP Cloud not available');
    }

    // Method 2: Check PPPoE interface
    if (!publicIp) {
      try {
        const pppoe = await conn.write('/interface/pppoe-client/print');
        if (pppoe && pppoe.length > 0) {
          for (const iface of pppoe) {
            if (iface.running === 'true' || iface.running === true) {
              // Get IP from PPPoE interface
              const pppIp = await conn.write('/ip/address/print', [
                '?interface=' + iface.name,
              ]);
              if (pppIp && pppIp[0] && pppIp[0].address) {
                publicIp = pppIp[0].address.split('/')[0];
                detectionMethod = `PPPoE (${iface.name})`;
                break;
              }
            }
          }
        }
      } catch (e) {
        console.log('PPPoE check failed');
      }
    }

    // Method 3: Get IP from interface with default route
    if (!publicIp) {
      try {
        // Get default route
        const routes = await conn.write('/ip/route/print', [
          '?dst-address=0.0.0.0/0',
          '?active=true',
        ]);
        
        if (routes && routes.length > 0) {
          const gateway = routes[0].gateway;
          const gatewayInterface = routes[0]['gateway-interface'] || routes[0].interface;
          
          if (gatewayInterface) {
            // Get IP from gateway interface
            const ifaceIp = await conn.write('/ip/address/print', [
              '?interface=' + gatewayInterface,
            ]);
            if (ifaceIp && ifaceIp[0] && ifaceIp[0].address) {
              const ip = ifaceIp[0].address.split('/')[0];
              // Check if it's not a private IP
              if (!ip.startsWith('192.168.') && !ip.startsWith('10.') && !ip.startsWith('172.')) {
                publicIp = ip;
                detectionMethod = `Default route (${gatewayInterface})`;
              }
            }
          }
        }
      } catch (e) {
        console.log('Route check failed');
      }
    }

    // Method 4: Use external service to detect public IP
    if (!publicIp) {
      try {
        // Run fetch from MikroTik to detect public IP
        const fetch = await conn.write('/tool/fetch', [
          '=url=http://api.ipify.org',
          '=mode=http',
          '=output=user',
          '=as-value=',
        ]);
        
        if (fetch && fetch[0] && fetch[0].data) {
          publicIp = fetch[0].data.trim();
          detectionMethod = 'External API (ipify.org)';
        }
      } catch (e) {
        console.log('External IP check failed:', e);
      }
    }

    // Method 5: Get all IPs and find non-private one
    if (!publicIp) {
      try {
        const allIps = await conn.write('/ip/address/print');
        for (const ipAddr of allIps) {
          const ip = ipAddr.address?.split('/')[0];
          if (ip && !ip.startsWith('192.168.') && !ip.startsWith('10.') && !ip.startsWith('172.16.') && !ip.startsWith('127.')) {
            publicIp = ip;
            detectionMethod = `Interface ${ipAddr.interface}`;
            break;
          }
        }
      } catch (e) {
        console.log('All IPs check failed');
      }
    }

    conn.close();

    if (publicIp) {
      return NextResponse.json({
        success: true,
        publicIp,
        detectionMethod,
        message: `Detected public IP: ${publicIp} via ${detectionMethod}`,
      });
    } else {
      return NextResponse.json({
        success: false,
        publicIp: null,
        error: 'Could not detect public IP from MikroTik',
        hint: 'Pastikan MikroTik terhubung ke internet dan memiliki IP publik',
      });
    }
  } catch (error: any) {
    console.error('Detect public IP error:', error);
    return NextResponse.json(
      {
        error: 'Failed to detect public IP',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
