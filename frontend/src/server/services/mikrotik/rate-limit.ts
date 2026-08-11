import 'server-only'
/**
 * PPPoE Rate Limit Change Without Disconnect
 *
 * Strategy (in order of preference):
 * 1. RADIUS CoA (radclient) - send Mikrotik-Rate-Limit via CoA-Request to port 3799
 *    → MikroTik immediately applies new rate-limit to the active PPPoE session
 * 2. MikroTik RouterOS API - /ppp/active/set rate-limit (RouterOS 7.x)
 *    → Directly sets rate-limit on the active PPP connection, modifies dynamic queue
 * 3. MikroTik RouterOS API - /queue/simple/set max-limit on <pppoe-{username}> queue
 *    → Finds the dynamic simple queue by name pattern and sets max-limit
 * 4. Fallback: disconnect (user reconnects with new rate from RADIUS DB)
 *
 * MikroTik CoA requires:
 *   /radius incoming set accept=yes port=3799
 *   RADIUS entry with address matching the source IP of CoA packets
 * RouterOS API requires: /ip service set api enabled=yes
 */

import { RouterOSAPI } from 'node-routeros';
import { sendCoARequest, isRadclientAvailable, sendDisconnectRequest } from '@/server/services/radius/coa.service';

export interface RouterConfig {
  ipAddress: string;
  nasname?: string;
  port?: number | null;
  username: string;
  password: string;
  secret?: string;
}

export interface RateLimitChangeResult {
  success: boolean;
  method: 'coa' | 'api-ppp-active' | 'api-queue' | 'disconnect' | 'none';
  message?: string;
  error?: string;
}

/**
 * Change rate limit via MikroTik RouterOS API.
 *
 * Tries two API approaches:
 * 1. /ppp/active/set rate-limit=X  (RouterOS 7.x — modifies the dynamic queue automatically)
 * 2. /queue/simple/set max-limit=X (find queue named <pppoe-{username}>)
 *
 * Returns { success, method } to indicate which worked.
 */
async function changeRateLimitViaAPI(
  router: RouterConfig,
  username: string,
  newRateLimit: string
): Promise<{ success: boolean; method: 'api-ppp-active' | 'api-queue' | 'none' }> {
  const api = new RouterOSAPI({
    host: router.ipAddress,
    port: router.port || 8728,
    user: router.username,
    password: router.password,
    timeout: 8,
  });

  try {
    await api.connect();

    // ── Approach 1: /ppp/active/set rate-limit (RouterOS 7.x) ──────────────
    // This is the most reliable method — directly modifies the PPP session's
    // rate-limit which automatically updates the dynamic simple queue.
    const activePPP = await api.write('/ppp/active/print');
    const activeConn = activePPP.find(
      (p: any) => p['name'] === username || p['username'] === username
    );

    if (activeConn) {
      try {
        const connId = activeConn['.id'];
        await api.write('/ppp/active/set', [
          `=.id=${connId}`,
          `=rate-limit=${newRateLimit}`,
        ]);
        console.log(`[RateLimit API] /ppp/active/set rate-limit=${newRateLimit} for ${username} (id: ${connId})`);
        await api.close();
        return { success: true, method: 'api-ppp-active' };
      } catch (err: any) {
        console.log(`[RateLimit API] /ppp/active/set failed: ${err?.message}, trying queue method...`);
      }
    } else {
      console.log(`[RateLimit API] No active PPP session found for ${username}`);
    }

    // ── Approach 2: /queue/simple/set max-limit on <pppoe-{username}> ──────
    // MikroTik PPPoE server creates dynamic queues named <pppoe-{username}>
    // e.g. user "server" → queue "<pppoe-server>"
    const queues = await api.write('/queue/simple/print');
    const expectedQueueName = `<pppoe-${username}>`;

    const queue = queues.find((q: any) => {
      const qName: string = q['name'] || '';
      return (
        qName === expectedQueueName ||  // Exact match: <pppoe-server>
        qName === username              // Fallback: plain username
      );
    });

    if (queue) {
      const queueId = queue['.id'];
      await api.write('/queue/simple/set', [
        `=.id=${queueId}`,
        `=max-limit=${newRateLimit}`,
      ]);
      console.log(`[RateLimit API] Queue "${queue['name']}" max-limit set to ${newRateLimit} for ${username}`);
      await api.close();
      return { success: true, method: 'api-queue' };
    }

    await api.close();
    console.log(`[RateLimit API] No matching queue found for ${username} (expected: ${expectedQueueName})`);
    return { success: false, method: 'none' };
  } catch (err: any) {
    try { await api.close(); } catch {}
    console.error(`[RateLimit API] Connection error for ${username}:`, err?.message || err);
    return { success: false, method: 'none' };
  }
}

/**
 * Change rate limit of an active PPPoE session — without disconnect.
 *
 * Tries (in order):
 * 1. RADIUS CoA — Mikrotik-Rate-Limit attribute via radclient
 * 2. RouterOS API — /ppp/active/set rate-limit (RouterOS 7.x)
 * 3. RouterOS API — /queue/simple/set max-limit on <pppoe-{username}> queue
 * 4. Disconnect as last resort (if allowDisconnect=true)
 *
 * CoA is preferred because it's the standard RADIUS approach, works across
 * network boundaries, and doesn't require the API user to have write permissions.
 */
export async function changePPPoERateLimit(
  router: RouterConfig,
  username: string,
  newRateLimit: string,
  sessionInfo?: {
    acctSessionId?: string;
    nasIpAddress?: string;     // MikroTik's NAS-IP from radacct (for CoA target)
    framedIpAddress?: string;
  },
  options?: {
    allowDisconnect?: boolean; // Fall back to disconnect if CoA fails (default: false)
  }
): Promise<RateLimitChangeResult> {
  const allowDisconnect = options?.allowDisconnect ?? false;
  const coaHost = router.ipAddress; // MikroTik IP (reachable via VPN tunnel)
  console.log(`[RateLimit] Changing rate limit for ${username} to ${newRateLimit} (target: ${coaHost})`);

  // ── Method 1: RADIUS CoA (Mikrotik-Rate-Limit attribute) ─────────────────
  // Send CoA-Request with Mikrotik-Rate-Limit to NAS port 3799.
  // MikroTik immediately applies the rate-limit to the matching active session.
  const coaAvailable = await isRadclientAvailable();
  if (coaAvailable) {
    try {
      const session = {
        username,
        acctSessionId: sessionInfo?.acctSessionId,
        nasIpAddress: coaHost,
        framedIpAddress: sessionInfo?.framedIpAddress,
      };
      const coaResult = await sendCoARequest(
        session,
        { rateLimit: newRateLimit },
        { host: coaHost, secret: router.secret }
      );

      if (coaResult.success) {
        console.log(`[RateLimit] CoA-ACK received — rate limit changed to ${newRateLimit} for ${username}`);
        return {
          success: true,
          method: 'coa',
          message: `Rate limit changed to ${newRateLimit} via RADIUS CoA`,
        };
      }
      console.log(`[RateLimit] CoA failed: ${coaResult.error}, trying API methods...`);
    } catch (coaErr: any) {
      console.log(`[RateLimit] CoA error: ${coaErr?.message}, trying API methods...`);
    }
  } else {
    console.log('[RateLimit] radclient not available, skipping CoA — trying API methods...');
  }

  // ── Method 2+3: RouterOS API (ppp/active/set → queue/simple/set) ─────────
  const apiResult = await changeRateLimitViaAPI(router, username, newRateLimit);
  if (apiResult.success) {
    return {
      success: true,
      method: apiResult.method,
      message: `Rate limit changed to ${newRateLimit} via RouterOS API (${apiResult.method})`,
    };
  }

  // ── Method 4: Fallback — disconnect (user reconnects with new rate) ───────
  if (allowDisconnect) {
    console.log(`[RateLimit] All non-disruptive methods failed. Disconnecting user ${username}...`);
    const disconnectResult = await sendDisconnectRequest(
      {
        username,
        acctSessionId: sessionInfo?.acctSessionId,
        nasIpAddress: coaHost,
        framedIpAddress: sessionInfo?.framedIpAddress,
      },
      { host: coaHost, secret: router.secret }
    );

    if (disconnectResult.success) {
      return {
        success: true,
        method: 'disconnect',
        message: 'User disconnected — will reconnect with new rate limit',
      };
    }

    return {
      success: false,
      method: 'disconnect',
      error: `All methods failed (CoA, API, Disconnect). Last error: ${disconnectResult.error}`,
    };
  }

  return {
    success: false,
    method: 'none',
    error: 'All methods failed (CoA + API). Check: radclient installed, MikroTik /radius incoming accept=yes, RADIUS address matches CoA source IP.',
  };
}
