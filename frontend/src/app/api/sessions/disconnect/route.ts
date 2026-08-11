import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { RouterOSAPI } from 'node-routeros';
import { sendDisconnectRequest, isRadclientAvailable } from '@/server/services/radius/coa.service';
import { logActivity } from '@/server/services/activity-log.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// Check if CoA is available (radclient installed)
let coaAvailable: boolean | null = null;

// Get router secret by NAS IP
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

// Disconnect PPPoE user via RADIUS CoA (sends directly to MikroTik NAS)
async function disconnectPPPoEViaCoA(
  username: string,
  session: { acctSessionId?: string; nasIpAddress?: string; framedIpAddress?: string }
): Promise<{ success: boolean; error?: string; targetNas?: string }> {
  try {
    if (!session.nasIpAddress) {
      return {
        success: false,
        error: 'No NAS IP address - cannot send CoA',
      };
    }

    // Get router secret from database
    const nasSecret = await getRouterSecret(session.nasIpAddress);
    
    console.log(`[Disconnect CoA] Sending to NAS ${session.nasIpAddress} for user ${username}`);
    
    const result = await sendDisconnectRequest({
      username,
      acctSessionId: session.acctSessionId,
      nasIpAddress: session.nasIpAddress,
      framedIpAddress: session.framedIpAddress,
      nasSecret: nasSecret || undefined,
    });
    
    return {
      success: result.success,
      error: result.error,
      targetNas: session.nasIpAddress,
    };
  } catch (error: any) {
    console.error(`[Disconnect CoA] Error for ${username}:`, error);
    return {
      success: false,
      error: error.message || 'CoA disconnect failed',
    };
  }
}

// Disconnect hotspot user via MikroTik API
async function disconnectHotspotUser(router: any, username: string): Promise<{ success: boolean; error?: string }> {
  const host = router.ipAddress || router.nasname;
  const port = router.port || 8728;
  
  console.log(`[Disconnect] Connecting to router ${router.name} (${host}:${port}) for user ${username}`);
  
  const apiOpts: any = {
    host,
    port,
    user: router.username,
    password: router.password,
    timeout: 5,
  };
  if (port === 8729 || port === router.apiPort) {
    apiOpts.tls = { rejectUnauthorized: false };
  }
  const api = new RouterOSAPI(apiOpts);

  try {
    await api.connect();
    console.log(`[Disconnect] Connected to ${router.name}`);
    
    // Find active hotspot user - try both "user" and "username" fields
    let activeUsers = await api.write('/ip/hotspot/active/print', [
      `?user=${username}`,
    ]);
    
    // If not found by "user", try printing all and filtering
    if (activeUsers.length === 0) {
      console.log(`[Disconnect] User not found by ?user filter, fetching all active users...`);
      const allUsers = await api.write('/ip/hotspot/active/print');
      console.log(`[Disconnect] All active users:`, JSON.stringify(allUsers, null, 2));
      
      // Filter manually by multiple possible fields
      activeUsers = allUsers.filter((u: any) => 
        u.user === username || 
        u.username === username || 
        u.name === username
      );
    }
    
    console.log(`[Disconnect] Found ${activeUsers.length} active sessions for ${username}`);
    
    if (activeUsers.length === 0) {
      await api.close();
      return { success: false, error: `User ${username} not found in hotspot active list` };
    }
    
    // Remove the user (disconnect)
    for (const user of activeUsers) {
      const userId = user['.id'];
      console.log(`[Disconnect] Removing user with .id=${userId}`);
      
      try {
        const removeResult = await api.write('/ip/hotspot/active/remove', [
          `=.id=${userId}`,
        ]);
        console.log(`[Disconnect] Remove result:`, removeResult);
      } catch (removeErr: any) {
        console.error(`[Disconnect] Remove error:`, removeErr);
        await api.close();
        return { success: false, error: `Failed to remove: ${removeErr.message || removeErr}` };
      }
    }
    
    await api.close();
    console.log(`[Disconnect] Successfully disconnected ${username}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[Disconnect] Failed to disconnect hotspot user ${username}:`, error);
    try { await api.close(); } catch {}
    return { success: false, error: error.message || error.toString() || 'Unknown error' };
  }
}

// Helper: hard timeout wrapper for RouterOS API calls
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

// Disconnect PPPoE user via MikroTik API
async function disconnectPPPoEUser(router: any, username: string): Promise<{ success: boolean; error?: string }> {
  const host = router.ipAddress || router.nasname;
  // Try API-SSL port first (apiPort/8729), then plaintext (port/8728)
  const primaryPort = router.apiPort || 8729;
  const fallbackPort = router.port || 8728;
  const portsToTry = [primaryPort, ...(fallbackPort !== primaryPort ? [fallbackPort] : [])];

  for (const tryPort of portsToTry) {
    try {
      const result = await withTimeout(
        (async () => {
          const apiOpts: any = {
            host,
            port: tryPort,
            user: router.username,
            password: router.password,
            timeout: 5,
          };
          // Enable TLS for API-SSL port (8729)
          if (tryPort === 8729 || tryPort === router.apiPort) {
            apiOpts.tls = { rejectUnauthorized: false };
          }
          const api = new RouterOSAPI(apiOpts);

          try {
            await api.connect();
            
            // Find active PPPoE session
            const activeSessions = await api.write('/ppp/active/print', [
              `?name=${username}`,
            ]);
            
            if (activeSessions.length === 0) {
              await api.close();
              return { success: false, error: 'User not found in PPPoE active list' };
            }
            
            // Remove the session (disconnect)
            for (const session of activeSessions) {
              await api.write('/ppp/active/remove', [
                `=.id=${session['.id']}`,
              ]);
            }
            
            await api.close();
            return { success: true };
          } catch (error: any) {
            try { await api.close(); } catch {}
            return { success: false, error: error.message };
          }
        })(),
        8000,
        `MikroTik API ${host}:${tryPort}`
      );
      if (result.success) return result;
    } catch (err: any) {
      console.log(`[Disconnect] PPPoE API failed on ${host}:${tryPort}: ${err?.message}`);
    }
  }
  return { success: false, error: `All API ports failed for ${host}` };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionIds, usernames, useCoA } = body; // Support both session IDs or usernames, useCoA for PPPoE

    if (!sessionIds && !usernames) {
      return NextResponse.json(
        { error: 'sessionIds or usernames required' },
        { status: 400 }
      );
    }

    // Check if CoA is available
    if (coaAvailable === null) {
      coaAvailable = await isRadclientAvailable();
    }

    // Get all active routers
    const routers = await prisma.router.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        nasname: true,
        ipAddress: true,
        username: true,
        password: true,
        port: true,
        secret: true,
      },
    });

    if (routers.length === 0) {
      return NextResponse.json(
        { error: 'No active routers configured' },
        { status: 400 }
      );
    }

    let results: any[] = [];

    // If sessionIds provided, disconnect by session IDs (from radacct acctsessionid)
    if (sessionIds && Array.isArray(sessionIds)) {
      for (const sessionId of sessionIds) {
        try {
          // Look up session in radacct by acctsessionid
          const session = await prisma.radacct.findFirst({
            where: {
              acctsessionid: sessionId,
              acctstoptime: null, // Only active sessions
            },
          });

          if (!session) {
            results.push({
              sessionId,
              success: false,
              error: 'Session not found or already stopped',
            });
            continue;
          }

          const username = session.username;

          // Determine session type by checking if user exists in pppoeUser
          const pppoeUser = await prisma.pppoeUser.findUnique({
            where: { username },
            select: { id: true },
          });
          const sessionType = pppoeUser ? 'pppoe' : 'hotspot';

          // Find the router - try matching by nasipaddress first
          let router = routers.find(r => 
            r.nasname === session.nasipaddress || 
            r.ipAddress === session.nasipaddress
          );

          // If not found and only one router, use it
          if (!router && routers.length === 1) {
            router = routers[0];
          }

          let result: { success: boolean; error?: string };
          
          // For PPPoE: use MikroTik API directly (faster, no CoA port needed).
          // CoA via radclient only as fallback when MikroTik API is unreachable.
          if (sessionType === 'pppoe') {
            if (router) {
              console.log(`[Disconnect] MikroTik API disconnect for PPPoE user: ${username}`);
              result = await disconnectPPPoEUser(router, username);
            } else {
              // Try all routers
              result = { success: false, error: 'Router not found' };
              for (const r of routers) {
                result = await disconnectPPPoEUser(r, username);
                if (result.success) { router = r; break; }
              }
            }
            // CoA fallback if MikroTik API failed and radclient is available
            if (!result.success && coaAvailable && session.nasipaddress) {
              console.log(`[Disconnect] MikroTik API failed, trying CoA fallback for: ${username}`);
              result = await disconnectPPPoEViaCoA(username, {
                acctSessionId: session.acctsessionid || undefined,
                nasIpAddress: session.nasipaddress || undefined,
                framedIpAddress: session.framedipaddress || undefined,
              });
            }
          } else if (router) {
            // Hotspot: MikroTik API
            result = await disconnectHotspotUser(router, username);
          } else {
            // Hotspot: try all routers
            result = { success: false, error: 'Router not found' };
            for (const r of routers) {
              result = await disconnectHotspotUser(r, username);
              if (result.success) { router = r; break; }
            }
          }

          results.push({
            sessionId,
            username,
            type: sessionType,
            router: router?.name || 'unknown',
            method: 'api',
            ...result,
          });

          // If disconnect successful, update radacct to mark session as stopped
          if (result.success) {
            await prisma.radacct.update({
              where: { radacctid: session.radacctid },
              data: {
                acctstoptime: new Date(),
                acctterminatecause: 'Admin-Reset',
              },
            });
          }
        } catch (error: any) {
          results.push({
            sessionId,
            success: false,
            error: error.message,
          });
        }
      }
    }

    // If usernames provided, disconnect by username
    if (usernames && Array.isArray(usernames)) {
      for (const username of usernames) {
        try {
          // Determine session type
          const pppoeUser = await prisma.pppoeUser.findUnique({
            where: { username },
            select: { id: true },
          });
          const sessionType = pppoeUser ? 'pppoe' : 'hotspot';

          // Get active session info for CoA
          const activeSession = await prisma.radacct.findFirst({
            where: {
              username,
              acctstoptime: null,
            },
            orderBy: { acctstarttime: 'desc' },
          });

          let result: { success: boolean; error?: string } = { success: false, error: 'Not disconnected' };
          let usedRouter: any = null;
          let method = 'api';

          // For PPPoE: MikroTik API first (faster, reliable via VPN tunnel).
          // CoA via radclient only as fallback when MikroTik API is unreachable.
          if (sessionType === 'pppoe') {
            for (const router of routers) {
              result = await disconnectPPPoEUser(router, username);
              if (result.success) { usedRouter = router; break; }
            }
            // CoA fallback if MikroTik API failed and radclient is available
            if (!result.success && coaAvailable) {
              method = 'coa';
              console.log(`[Disconnect] MikroTik API failed, trying CoA fallback for: ${username}`);
              result = await disconnectPPPoEViaCoA(username, {
                acctSessionId: activeSession?.acctsessionid || undefined,
                nasIpAddress: activeSession?.nasipaddress || undefined,
                framedIpAddress: activeSession?.framedipaddress || undefined,
              });
            }
          } else {
            // Hotspot: try all routers
            for (const router of routers) {
              result = await disconnectHotspotUser(router, username);
              if (result.success) { usedRouter = router; break; }
            }
          }

          if (result.success) {
            results.push({
              username,
              type: sessionType,
              router: usedRouter?.name || 'via-coa',
              method,
              success: true,
            });

            // Update radacct if session exists
            if (activeSession) {
              await prisma.radacct.update({
                where: { radacctid: activeSession.radacctid },
                data: {
                  acctstoptime: new Date(),
                  acctterminatecause: 'Admin-Reset',
                },
              });
            }
          } else {
            results.push({
              username,
              type: sessionType,
              method,
              success: false,
              error: result.error || 'User not found on any router',
            });
          }
        } catch (error: any) {
          results.push({
            username,
            success: false,
            error: error.message,
          });
        }
      }
    }

    // Calculate summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    // Log activity
    try {
      const session = await getServerSession(authOptions);
      const usernamesStr = Array.isArray(usernames) ? usernames.join(', ') : String(usernames || '');
      await logActivity({
        userId: (session?.user as any)?.id,
        username: (session?.user as any)?.username || 'Admin',
        userRole: (session?.user as any)?.role,
        action: 'DISCONNECT_SESSION',
        description: `Disconnected ${successful} session(s): ${usernamesStr.substring(0, 100)}`,
        module: 'session',
        status: failed > 0 ? 'warning' : 'success',
        request,
        metadata: {
          total: results.length,
          successful,
          failed,
        },
      });
    } catch (logError) {
      console.error('Activity log error:', logError);
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: results.length,
        successful,
        failed,
      },
      results,
    });
  } catch (error: any) {
    console.error('Disconnect sessions error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
