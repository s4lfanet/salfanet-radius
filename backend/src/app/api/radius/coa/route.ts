import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { 
  sendCoARequest, 
  sendDisconnectRequest, 
  applyProfileChangeToActiveSessions,
  testCoAConnection,
  testLocalCoA,
  isRadclientAvailable 
} from '@/server/services/radius/coa.service';

/**
 * RADIUS CoA (Change of Authorization) API
 * 
 * IMPORTANT: CoA is sent DIRECTLY to MikroTik NAS, not to FreeRADIUS!
 * 
 * POST /api/radius/coa
 * 
 * Actions:
 * - disconnect: Send Disconnect-Request to MikroTik to terminate a session
 * - update: Send CoA-Request to MikroTik to update session attributes (e.g., speed)
 * - test: Test CoA connection to a specific NAS
 * - test-local: Test radclient connection to local FreeRADIUS
 * 
 * Example requests:
 * 
 * 1. Disconnect user:
 * {
 *   "action": "disconnect",
 *   "username": "user123"
 * }
 * 
 * 2. Update user speed:
 * {
 *   "action": "update",
 *   "username": "user123",
 *   "attributes": {
 *     "downloadSpeed": 20,
 *     "uploadSpeed": 10
 *   }
 * }
 * 
 * 3. Test CoA to specific NAS:
 * {
 *   "action": "test",
 *   "host": "103.191.165.156"
 * }
 */

// Helper to get router secret by NAS IP
async function getRouterSecret(nasIpAddress: string): Promise<string | null> {
  const router = await prisma.router.findFirst({
    where: {
      OR: [
        { nasname: nasIpAddress },
        { ipAddress: nasIpAddress },
      ],
    },
    select: { secret: true },
  });
  return router?.secret || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, username, attributes, fallbackToDisconnect } = body;

    // Check if radclient is available
    const coaAvailable = await isRadclientAvailable();
    if (!coaAvailable) {
      return NextResponse.json({
        error: 'CoA not available - radclient not installed on server',
        suggestion: 'Install FreeRADIUS utils: apt install freeradius-utils',
      }, { status: 503 });
    }

    switch (action) {
      case 'test-local': {
        // Test radclient to local FreeRADIUS (just to verify radclient works)
        const result = await testLocalCoA();
        return NextResponse.json({
          success: result.success,
          action: 'test-local',
          result,
        });
      }

      case 'test': {
        // Test CoA to specific NAS (MikroTik)
        const { host } = body;
        if (!host) {
          return NextResponse.json({ 
            error: 'host (NAS IP) is required for CoA test',
            example: { action: 'test', host: '103.191.165.156' },
          }, { status: 400 });
        }
        
        // Get router secret
        const secret = await getRouterSecret(host);
        
        const result = await testCoAConnection({ 
          host, 
          secret: secret || undefined,
        });
        return NextResponse.json({
          success: result.success,
          action: 'test',
          targetHost: host,
          result,
        });
      }

      case 'disconnect': {
        if (!username) {
          return NextResponse.json({ error: 'username is required' }, { status: 400 });
        }

        // Find active session
        const session = await prisma.radacct.findFirst({
          where: {
            username,
            acctstoptime: null,
          },
          select: {
            radacctid: true,
            acctsessionid: true,
            nasipaddress: true,
            framedipaddress: true,
          },
        });

        if (!session?.nasipaddress) {
          return NextResponse.json({
            success: false,
            error: 'No active session found or NAS IP unknown',
            username,
          }, { status: 404 });
        }

        // Get router secret for this NAS
        const secret = await getRouterSecret(session.nasipaddress);

        const result = await sendDisconnectRequest({
          username,
          acctSessionId: session.acctsessionid || undefined,
          nasIpAddress: session.nasipaddress,
          framedIpAddress: session.framedipaddress || undefined,
          nasSecret: secret || undefined,
        });

        // If successful, update radacct
        if (result.success && session) {
          await prisma.radacct.update({
            where: { radacctid: session.radacctid },
            data: {
              acctstoptime: new Date(),
              acctterminatecause: 'Admin-Reset',
            },
          });
        }

        return NextResponse.json({
          success: result.success,
          action: 'disconnect',
          username,
          targetNas: session.nasipaddress,
          result,
        });
      }

      case 'update': {
        if (!username) {
          return NextResponse.json({ error: 'username is required' }, { status: 400 });
        }

        if (!attributes) {
          return NextResponse.json({ error: 'attributes object is required' }, { status: 400 });
        }

        // Find active session
        const session = await prisma.radacct.findFirst({
          where: {
            username,
            acctstoptime: null,
          },
          select: {
            acctsessionid: true,
            nasipaddress: true,
            framedipaddress: true,
          },
        });

        if (!session?.nasipaddress) {
          return NextResponse.json({
            success: false,
            error: 'No active session found or NAS IP unknown',
            username,
          }, { status: 404 });
        }

        // Get router secret
        const secret = await getRouterSecret(session.nasipaddress);

        const result = await applyProfileChangeToActiveSessions(
          username,
          [{
            acctSessionId: session.acctsessionid || undefined,
            nasIpAddress: session.nasipaddress,
            framedIpAddress: session.framedipaddress || undefined,
            nasSecret: secret || undefined,
          }],
          {
            downloadSpeed: attributes.downloadSpeed,
            uploadSpeed: attributes.uploadSpeed,
            groupName: attributes.groupName,
            rateLimit: attributes.rateLimit,
          },
          { 
            fallbackToDisconnect: fallbackToDisconnect !== false,
            secret: secret || undefined,
          }
        );

        return NextResponse.json({
          success: result.success,
          action: result.action,
          username,
          targetNas: session.nasipaddress,
          results: result.results,
        });
      }

      case 'sync-profile': {
        // Sync a profile change to all active sessions using that profile
        const { profileId } = body;
        
        if (!profileId) {
          return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
        }

        const profile = await prisma.pppoeProfile.findUnique({
          where: { id: profileId },
        });

        if (!profile) {
          return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        // Find all users using this profile
        const users = await prisma.pppoeUser.findMany({
          where: { profileId },
          select: { username: true },
        });

        const results: any[] = [];

        for (const user of users) {
          const session = await prisma.radacct.findFirst({
            where: {
              username: user.username,
              acctstoptime: null,
            },
            select: {
              acctsessionid: true,
              nasipaddress: true,
              framedipaddress: true,
            },
          });

          if (session?.nasipaddress) {
            // Get router secret
            const secret = await getRouterSecret(session.nasipaddress);
            
            const result = await applyProfileChangeToActiveSessions(
              user.username,
              [{
                acctSessionId: session.acctsessionid || undefined,
                nasIpAddress: session.nasipaddress,
                framedIpAddress: session.framedipaddress || undefined,
                nasSecret: secret || undefined,
              }],
              {
                downloadSpeed: profile.downloadSpeed,
                uploadSpeed: profile.uploadSpeed,
                groupName: profile.groupName,
              },
              { 
                fallbackToDisconnect: true,
                secret: secret || undefined,
              }
            );

            results.push({
              username: user.username,
              targetNas: session.nasipaddress,
              success: result.success,
              action: result.action,
            });
          }
        }

        return NextResponse.json({
          success: true,
          action: 'sync-profile',
          profileId,
          profileName: profile.name,
          totalUsers: users.length,
          activeSessions: results.length,
          results,
        });
      }

      default:
        return NextResponse.json({
          error: 'Invalid action',
          validActions: ['disconnect', 'update', 'test', 'test-local', 'sync-profile'],
        }, { status: 400 });
    }
  } catch (error: any) {
    console.error('CoA API error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message,
    }, { status: 500 });
  }
}

// GET - Check CoA status and get info
export async function GET() {
  try {
    const coaAvailable = await isRadclientAvailable();
    
    // Get list of NAS/routers for testing
    const routers = await prisma.router.findMany({
      where: { isActive: true },
      select: { id: true, name: true, nasname: true, ipAddress: true },
    });
    
    return NextResponse.json({
      available: coaAvailable,
      port: process.env.RADIUS_COA_PORT || '3799',
      info: {
        description: 'RADIUS Change of Authorization (CoA) API - sends CoA directly to MikroTik NAS',
        endpoints: {
          'POST /api/radius/coa': {
            actions: {
              'test-local': 'Test radclient to local FreeRADIUS',
              test: 'Test CoA to specific NAS (requires host parameter)',
              disconnect: 'Disconnect user session on MikroTik',
              update: 'Update session attributes (speed) on MikroTik',
              'sync-profile': 'Sync profile changes to all active sessions',
            },
          },
        },
        requirements: [
          'radclient installed (freeradius-utils)',
          'MikroTik: /radius incoming set accept=yes port=3799',
          'Router secret in database must match MikroTik RADIUS client secret',
        ],
        note: 'CoA is sent directly to MikroTik NAS IP (from radacct.nasipaddress), NOT to FreeRADIUS',
      },
      routers: routers.map(r => ({
        name: r.name,
        nasIp: r.nasname || r.ipAddress,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
