import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
const RouterOSAPI = require('node-routeros').RouterOSAPI;

interface MikrotikInterface {
  name: string;
  type: string;
  mtu: string;
  macAddress: string;
  running: boolean;
  disabled: boolean;
  comment?: string;
}

// GET - Get all interfaces from Mikrotik router
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routerId } = await params;

    // Get router info
    const router = await prisma.router.findUnique({
      where: { id: routerId },
    });

    if (!router) {
      return NextResponse.json({ error: 'Router not found' }, { status: 404 });
    }

    if (!router.isActive) {
      return NextResponse.json({ error: 'Router is not active' }, { status: 400 });
    }

    // Connect to Mikrotik
    const conn = new RouterOSAPI({
      host: router.ipAddress,
      user: router.username,
      password: router.password,
      port: router.port || 8728,
      timeout: 10,
      tls: false,
    });

    try {
      await conn.connect();
    } catch (connError: any) {
      return NextResponse.json(
        { 
          error: 'Failed to connect to router',
          details: connError.message,
        },
        { status: 503 }
      );
    }

    try {
      // Get all interfaces
      const interfaces = await conn.write('/interface/print');
      
      const result: MikrotikInterface[] = interfaces.map((iface: any) => ({
        name: iface.name || '',
        type: iface.type || '',
        mtu: iface.mtu || iface['actual-mtu'] || '',
        macAddress: iface['mac-address'] || '',
        running: iface.running === 'true' || iface.running === true,
        disabled: iface.disabled === 'true' || iface.disabled === true,
        comment: iface.comment || '',
      }));

      // Filter only ethernet, sfp, vlan, bridge, bonding interfaces (relevant for uplinks)
      const relevantTypes = ['ether', 'sfp', 'sfp-sfpplus', 'vlan', 'bridge', 'bonding', 'combo'];
      const filtered = result.filter(iface => 
        relevantTypes.some(type => iface.type.toLowerCase().includes(type)) ||
        iface.name.toLowerCase().startsWith('ether') ||
        iface.name.toLowerCase().startsWith('sfp') ||
        iface.name.toLowerCase().startsWith('combo')
      );

      conn.close();

      return NextResponse.json({
        success: true,
        router: {
          id: router.id,
          name: router.name,
          ipAddress: router.ipAddress,
        },
        interfaces: filtered,
        allInterfaces: result,
      });
    } catch (cmdError: any) {
      conn.close();
      return NextResponse.json(
        { error: 'Failed to get interfaces', details: cmdError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Get interfaces error:', error);
    return NextResponse.json(
      { error: 'Failed to get interfaces', details: error.message },
      { status: 500 }
    );
  }
}
