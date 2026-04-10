import { NextRequest, NextResponse } from 'next/server';
import { reloadFreeRadius } from '@/server/services/radius/freeradius.service';
import { logActivity } from '@/server/services/activity-log.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import crypto from 'crypto';
import os from 'os';
const RouterOSAPI = require('node-routeros').RouterOSAPI;
import { prisma } from '@/server/db/client';

// Auto-detect server IP from network interfaces
const getServerIp = (): string => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
};

// RADIUS Server IP - prioritas: ENV > auto-detect
const getRadiusServerIp = () => process.env.RADIUS_SERVER_IP || process.env.VPS_IP || getServerIp();

// GET - Load all routers
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const radiusServerIp = getRadiusServerIp();
    
    const routers = await prisma.router.findMany({
      include: {
        vpnClient: {
          select: {
            id: true,
            name: true,
            vpnIp: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
    
    // Load VPN clients
    const vpnClients = await prisma.vpnClient.findMany({
      select: {
        id: true,
        name: true,
        vpnIp: true,
        isRadiusServer: true,
        apiUsername: true,
        apiPassword: true,
      },
      orderBy: { name: 'asc' },
    });

    // Attach nasSecret + credentials from linked router (NAS) entry
    const clientIds = vpnClients.map((c: { id: string }) => c.id)
    const nasEntries = clientIds.length > 0
      ? await prisma.router.findMany({
          where: { vpnClientId: { in: clientIds } },
          select: { vpnClientId: true, secret: true, username: true, password: true },
        })
      : []
    type NasEntry = { vpnClientId: string | null; secret: string; username: string; password: string }
    const nasMap = new Map(nasEntries.map((n: NasEntry) => [n.vpnClientId, n]))
    const vpnClientsWithSecret = vpnClients.map((c: { id: string; name: string; vpnIp: string; isRadiusServer: boolean; apiUsername: string | null; apiPassword: string | null }) => {
      const nas = nasMap.get(c.id)
      return {
        ...c,
        nasSecret: nas?.secret ?? null,
        // Use vpnClient API creds first; fall back to NAS entry creds (e.g. WireGuard)
        resolvedUsername: c.apiUsername ?? nas?.username ?? null,
        resolvedPassword: c.apiPassword ?? nas?.password ?? null,
      }
    })
    
    // Add radiusServerIp as computed field for frontend display
    // Note: 'server' field in NAS table is for FreeRADIUS virtual_server name, NOT RADIUS IP
    const routersWithServer = routers.map(router => ({
      ...router,
      radiusServerIp: radiusServerIp,  // For frontend display only
      ports: router.ports || 1812,
    }));

    return NextResponse.json({ routers: routersWithServer, vpnClients: vpnClientsWithSecret, radiusServerIp });
  } catch (error) {
    console.error('Load routers error:', error);
    return NextResponse.json({ error: 'Failed to load routers' }, { status: 500 });
  }
}

// POST - Add new router
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, ipAddress, nasIpAddress, username, password, port, apiPort, secret, latitude, longitude, vpnClientId, type } = body;

    // Basic validation
    if (!name || !ipAddress) {
      return NextResponse.json(
        { error: 'Name and IP address are required' },
        { status: 400 }
      );
    }

    // For non-gateway types, require username and password
    const isGateway = type === 'gateway' || name.toLowerCase().includes('gateway');
    if (!isGateway && (!username || !password)) {
      return NextResponse.json(
        { error: 'Username and password are required for MikroTik routers' },
        { status: 400 }
      );
    }

    // Parse integers
    const portInt = parseInt(port) || 8728;
    const apiPortInt = parseInt(apiPort) || 8729;

    // Generate shortname from name (remove spaces, lowercase)
    const shortname = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // nasname = IP yang digunakan FreeRADIUS untuk autentikasi (IP publik/VPN source)
    // ipAddress = IP untuk koneksi API MikroTik
    // Jika nasIpAddress tidak diisi, gunakan ipAddress sebagai default
    const nasname = nasIpAddress || ipAddress;

    // Check if router with same nasname+port+secret already exists
    const existingRouter = await prisma.router.findFirst({
      where: {
        nasname,
        ports: 1812,
        secret: secret || 'secret123',
      },
    });

    if (existingRouter) {
      return NextResponse.json(
        { 
          error: 'Router dengan kombinasi IP, Port RADIUS, dan Secret yang sama sudah ada. Gunakan port atau secret berbeda.',
          details: `Existing router: ${existingRouter.name}`
        },
        { status: 409 }
      );
    }

    // Test connection to MikroTik (skip for gateway type)
    if (!isGateway) {
      try {
        const conn = new RouterOSAPI({
          host: ipAddress,
          user: username,
          password: password,
          port: portInt,
          timeout: 5,
          tls: false,
        });

        await conn.connect();
      
        // Get router identity
        const identity = await conn.write('/system/identity/print');
        
        conn.close();
      } catch (apiError: any) {
        return NextResponse.json(
          { error: `Failed to connect to router: ${apiError.message}` },
          { status: 400 }
        );
      }
    }

    // Save to database
    // Note: 'server' field left NULL - it's for FreeRADIUS virtual_server name, not RADIUS IP
    const router = await prisma.router.create({
      data: {
        id: crypto.randomUUID(),
        name,
        nasname,           // IP untuk FreeRADIUS client (IP publik/VPN)
        shortname,
        type: type || 'mikrotik',
        ipAddress,         // IP untuk koneksi API MikroTik
        username: username || '',  // Empty string for gateway type
        password: password || '',  // Empty string for gateway type
        port: portInt,
        apiPort: apiPortInt,
        secret: secret || 'secret123',
        // server: NULL - untuk FreeRADIUS virtual_server name
        ports: 1812, // RADIUS auth port
        description: isGateway ? `Gateway - ${name}` : `MikroTik Router - ${name}`,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        vpnClientId: vpnClientId || null,
        isActive: true,
      },
    });

    // Restart FreeRADIUS to reload NAS table
    await reloadFreeRadius();

    // Log activity
    try {
      const session = await getServerSession(authOptions);
      await logActivity({
        userId: (session?.user as any)?.id,
        username: (session?.user as any)?.username || 'Admin',
        userRole: (session?.user as any)?.role,
        action: 'ADD_ROUTER',
        description: `Added new router: ${name}`,
        module: 'network',
        status: 'success',
        request,
        metadata: {
          routerId: router.id,
          routerName: name,
          ipAddress,
          nasIpAddress: nasname,
        },
      });
    } catch (logError) {
      console.error('Activity log error:', logError);
    }

    return NextResponse.json({
      success: true,
      router,
      message: isGateway ? 'Gateway added successfully' : 'Router added and connection test successful',
    });
  } catch (error) {
    console.error('Add router error:', error);
    return NextResponse.json({ error: 'Failed to add router' }, { status: 500 });
  }
}

// PUT - Update router
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    // Support both 'nasname' (from frontend) and 'nasIpAddress' for backward compatibility
    const { id, name, type, ipAddress, nasIpAddress, nasname: nasnameFromBody, username, password, port, secret, isActive, latitude, longitude, vpnClientId } = body;

    if (!id) {
      return NextResponse.json({ error: 'Router ID is required' }, { status: 400 });
    }

    // Generate shortname from name if name is provided
    const shortname = name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : undefined;
    
    // nasname = IP untuk FreeRADIUS (IP publik/VPN)
    // Support: nasIpAddress (legacy) atau nasname (dari frontend)
    const nasname = nasIpAddress || nasnameFromBody || ipAddress || undefined;

    // Determine router type — skip connection test for gateway/VPS (no API credentials)
    const currentRouter = await prisma.router.findUnique({ where: { id } });
    if (!currentRouter) {
      return NextResponse.json({ error: 'Router not found' }, { status: 404 });
    }
    const effectiveType = type || currentRouter.type;
    const isGateway = effectiveType === 'gateway';

    // Test connection only for MikroTik routers with changed credentials
    // Skip when vpnClientId is set: IP is a VPN tunnel IP managed by the system,
    // the connection test is not reliable from arbitrary network contexts.
    const effectiveVpnClientId = vpnClientId !== undefined ? vpnClientId : currentRouter.vpnClientId
    if (!isGateway && !effectiveVpnClientId && (username || password || port)) {
      try {
        const conn = new RouterOSAPI({
          host: ipAddress || currentRouter.ipAddress,
          user: username || currentRouter.username,
          password: password || currentRouter.password,
          port: port || currentRouter.port || 8728,
          timeout: 5,
          tls: false,
        });

        await conn.connect();
        conn.close();
      } catch (connError: any) {
        return NextResponse.json(
          { 
            error: 'Failed to connect with new credentials', 
            details: connError.message 
          },
          { status: 400 }
        );
      }
    }

    // Note: 'server' field is for FreeRADIUS virtual_server name, not RADIUS IP
    // Don't update it here - RADIUS Server IP is from environment variable
    
    const router = await prisma.router.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(shortname && { shortname }),
        ...(type && { type }),
        ...(nasname && { nasname }),
        ...(ipAddress && { ipAddress }),
        ...(username && { username }),
        ...(password && { password }),
        ...(port && { port: parseInt(port.toString()) }),
        ...(secret && { secret }),
        ...(isActive !== undefined && { isActive }),
        ...(latitude !== undefined && { latitude: latitude ? parseFloat(latitude) : null }),
        ...(longitude !== undefined && { longitude: longitude ? parseFloat(longitude) : null }),
        ...(vpnClientId !== undefined && { vpnClientId: vpnClientId || null }),
        // server: NULL - untuk FreeRADIUS virtual_server name
      },
    });

    // Restart FreeRADIUS to reload NAS table
    await reloadFreeRadius();

    // Log activity
    try {
      const session = await getServerSession(authOptions);
      await logActivity({
        userId: (session?.user as any)?.id,
        username: (session?.user as any)?.username || 'Admin',
        userRole: (session?.user as any)?.role,
        action: 'UPDATE_ROUTER',
        description: `Updated router: ${router.name}`,
        module: 'network',
        status: 'success',
        request,
        metadata: {
          routerId: router.id,
          routerName: router.name,
          changes: {
            name: name || undefined,
            ipAddress: ipAddress || undefined,
            nasIpAddress: nasIpAddress || undefined,
            isActive: isActive !== undefined ? isActive : undefined,
          },
        },
      });
    } catch (logError) {
      console.error('Activity log error:', logError);
    }

    // Return updated router with vpnClient included for frontend RADIUS script refresh
    const updatedRouter = await prisma.router.findUnique({
      where: { id },
      include: { vpnClient: { select: { id: true, name: true, vpnIp: true } } },
    });
    return NextResponse.json({ success: true, router: updatedRouter ?? router, vpnClientChanged: vpnClientId !== undefined });
  } catch (error) {
    console.error('Update router error:', error);
    return NextResponse.json({ error: 'Failed to update router' }, { status: 500 });
  }
}

// DELETE - Remove router
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Router ID is required' }, { status: 400 });
    }

    // Get router details before deletion
    const router = await prisma.router.findUnique({
      where: { id },
      select: { id: true, name: true, ipAddress: true },
    });

    if (!router) {
      return NextResponse.json({ error: 'Router not found' }, { status: 404 });
    }

    await prisma.router.delete({
      where: { id },
    });

    // Restart FreeRADIUS to reload NAS table
    await reloadFreeRadius();

    // Log activity
    try {
      const session = await getServerSession(authOptions);
      await logActivity({
        userId: (session?.user as any)?.id,
        username: (session?.user as any)?.username || 'Admin',
        userRole: (session?.user as any)?.role,
        action: 'DELETE_ROUTER',
        description: `Deleted router: ${router.name}`,
        module: 'network',
        status: 'success',
        request,
        metadata: {
          routerId: router.id,
          routerName: router.name,
          ipAddress: router.ipAddress,
        },
      });
    } catch (logError) {
      console.error('Activity log error:', logError);
    }

    return NextResponse.json({ success: true, message: 'Router deleted successfully' });
  } catch (error) {
    console.error('Delete router error:', error);
    return NextResponse.json({ error: 'Failed to delete router' }, { status: 500 });
  }
}
