import 'server-only'
/**
 * RADIUS Change of Authorization (CoA) & Disconnect Utilities
 * 
 * This module provides utilities to send RADIUS CoA and Disconnect-Request
 * packets DIRECTLY to MikroTik NAS (not to FreeRADIUS) for:
 * 1. Disconnecting active sessions (Disconnect-Request)
 * 2. Applying profile changes to active sessions (CoA-Request)
 * 
 * Requirements:
 * - MikroTik configured with: /radius incoming set accept=yes port=3799
 * - radclient installed on server (freeradius-utils)
 * 
 * IMPORTANT: CoA must be sent to the NAS (MikroTik) IP address, not to FreeRADIUS!
 * The NAS IP is obtained from radacct.nasipaddress field.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';

const execAsync = promisify(exec);

// Default CoA settings - these should match MikroTik RADIUS client secret
const DEFAULT_COA_PORT = process.env.RADIUS_COA_PORT || '3799';
const DEFAULT_COA_SECRET = process.env.RADIUS_COA_SECRET || '';
if (!DEFAULT_COA_SECRET) {
  console.warn('[CoA] RADIUS_COA_SECRET env var not set — CoA will use empty secret (ensure this matches NAS config)');
}

interface CoAResult {
  success: boolean;
  message?: string;
  error?: string;
  response?: string;
  targetHost?: string;
}

interface SessionInfo {
  username?: string;
  sessionId?: string;
  nasIpAddress?: string;  // THIS IS THE TARGET - MikroTik IP where to send CoA
  framedIpAddress?: string;
  acctSessionId?: string;
  nasSecret?: string;  // Router secret for CoA (optional, uses default if not set)
}

interface ProfileAttributes {
  downloadSpeed?: number; // in Mbps
  uploadSpeed?: number; // in Mbps
  groupName?: string;
  rateLimit?: string; // Format: "downloadM/uploadM"
}

/**
 * Execute radclient command to send RADIUS packets
 * @param host - Target NAS IP (MikroTik)
 * @param port - CoA port (default 3799)
 * @param type - 'coa' or 'disconnect'
 * @param secret - RADIUS secret (must match MikroTik RADIUS client secret)
 * @param attributes - RADIUS attributes to send
 */
async function executeRadclient(
  host: string,
  port: string,
  type: 'coa' | 'disconnect',
  secret: string,
  attributes: string
): Promise<CoAResult> {
  const tmpFile = `/tmp/coa-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  try {
    // Write attributes to a temp file — avoids shell quoting/injection issues
    await writeFile(tmpFile, attributes + '\n');

    // Build radclient command - send directly to NAS (MikroTik)
    // -d /usr/share/freeradius is required to load vendor dictionaries (e.g. MikroTik)
    // Without it, Mikrotik-Rate-Limit is sent as unknown attribute and MikroTik rejects it
    const command = `radclient -x -d /usr/share/freeradius -t 3 -r 1 ${host}:${port} ${type} ${secret} < ${tmpFile}`;
    
    console.log(`[CoA] Sending ${type} to NAS ${host}:${port}`);
    
    const { stdout, stderr } = await execAsync(command, { timeout: 10000 });
    
    const output = stdout + stderr;
    console.log(`[CoA] Response from ${host}: ${output}`);
    
    // Check for ACK response
    if (output.includes('CoA-ACK') || output.includes('Disconnect-ACK')) {
      return {
        success: true,
        message: type === 'coa' ? 'CoA-ACK received' : 'Disconnect-ACK received',
        response: output,
        targetHost: host,
      };
    } else if (output.includes('CoA-NAK') || output.includes('Disconnect-NAK')) {
      return {
        success: false,
        error: `${type.toUpperCase()}-NAK received - NAS rejected the request`,
        response: output,
        targetHost: host,
      };
    } else if (output.includes('No reply')) {
      return {
        success: false,
        error: `No reply from NAS ${host} - check if CoA is enabled on MikroTik (/radius incoming set accept=yes)`,
        response: output,
        targetHost: host,
      };
    }
    
    return {
      success: false,
      error: 'Unknown response',
      response: output,
      targetHost: host,
    };
  } catch (error: any) {
    console.error(`[CoA] Error sending to ${host}:`, error);
    return {
      success: false,
      error: error.message || 'Failed to execute radclient',
      targetHost: host,
    };
  } finally {
    // Always clean up temp file
    try { await unlink(tmpFile); } catch {}
  }
}

/**
 * Send Disconnect-Request to terminate a user session
 * IMPORTANT: This sends directly to the NAS (MikroTik), not to FreeRADIUS
 * 
 * @param session - Session info including nasIpAddress (target MikroTik)
 * @param options - Override host/port/secret if needed
 */
export async function sendDisconnectRequest(
  session: SessionInfo,
  options?: {
    host?: string;  // Override NAS IP (default: use session.nasIpAddress)
    port?: string;
    secret?: string;
  }
): Promise<CoAResult> {
  // Target is the NAS IP (MikroTik) - NOT FreeRADIUS!
  const host = options?.host || session.nasIpAddress;
  const port = options?.port || DEFAULT_COA_PORT;
  const secret = options?.secret || session.nasSecret || DEFAULT_COA_SECRET;
  
  if (!host) {
    return {
      success: false,
      error: 'No NAS IP address provided - cannot send Disconnect-Request without knowing which MikroTik to contact',
    };
  }
  
  // Build attributes for Disconnect-Request
  const attributeLines: string[] = [];

  // NAS-IP-Address: required by RFC 5176 to identify the NAS
  // Use the host (NAS IP) as the NAS-IP-Address attribute
  if (host) {
    attributeLines.push(`NAS-IP-Address=${host}`);
  }

  if (session.username) {
    attributeLines.push(`User-Name=${session.username}`);
  }
  
  // Acct-Session-Id is crucial for MikroTik to identify the session
  if (session.acctSessionId) {
    attributeLines.push(`Acct-Session-Id=${session.acctSessionId}`);
  }
  
  // Framed-IP-Address can also help identify the session
  if (session.framedIpAddress) {
    attributeLines.push(`Framed-IP-Address=${session.framedIpAddress}`);
  }
  
  if (attributeLines.length === 0) {
    return {
      success: false,
      error: 'No session identifiers provided (need at least username or session-id)',
    };
  }
  
  const attributes = attributeLines.join('\n');
  
  console.log(`[CoA] Sending Disconnect-Request to NAS ${host} for user: ${session.username}`);
  
  return executeRadclient(host, port, 'disconnect', secret, attributes);
}

/**
 * Send CoA-Request to modify an active session (e.g., change speed)
 * IMPORTANT: This sends directly to the NAS (MikroTik), not to FreeRADIUS
 * 
 * @param session - Session info including nasIpAddress (target MikroTik)
 * @param newAttributes - New attributes to apply (rate-limit, etc.)
 * @param options - Override host/port/secret if needed
 */
export async function sendCoARequest(
  session: SessionInfo,
  newAttributes: ProfileAttributes,
  options?: {
    host?: string;  // Override NAS IP (default: use session.nasIpAddress)
    port?: string;
    secret?: string;
  }
): Promise<CoAResult> {
  // Target is the NAS IP (MikroTik) - NOT FreeRADIUS!
  const host = options?.host || session.nasIpAddress;
  const port = options?.port || DEFAULT_COA_PORT;
  const secret = options?.secret || session.nasSecret || DEFAULT_COA_SECRET;
  
  if (!host) {
    return {
      success: false,
      error: 'No NAS IP address provided - cannot send CoA without knowing which MikroTik to contact',
    };
  }
  
  // Build attributes for CoA-Request
  const attributeLines: string[] = [];

  // NAS-IP-Address: required by RFC 5176 to identify the NAS
  if (host) {
    attributeLines.push(`NAS-IP-Address=${host}`);
  }

  // Session identification (at least one required)
  if (session.username) {
    attributeLines.push(`User-Name=${session.username}`);
  }
  
  if (session.acctSessionId) {
    attributeLines.push(`Acct-Session-Id=${session.acctSessionId}`);
  }
  
  if (session.framedIpAddress) {
    attributeLines.push(`Framed-IP-Address=${session.framedIpAddress}`);
  }
  
  // New attributes to apply
  if (newAttributes.rateLimit) {
    attributeLines.push(`Mikrotik-Rate-Limit=${newAttributes.rateLimit}`);
  } else if (newAttributes.downloadSpeed && newAttributes.uploadSpeed) {
    // Format: rx-rate[/tx-rate] [rx-burst/tx-burst] [rx-burst-threshold/tx-burst-threshold] [rx-burst-time/tx-burst-time] [priority] [rx-limit/tx-limit]
    // Simple format: download/upload (from user perspective, so rx=download, tx=upload for MikroTik)
    const rateLimit = `${newAttributes.downloadSpeed}M/${newAttributes.uploadSpeed}M`;
    attributeLines.push(`Mikrotik-Rate-Limit=${rateLimit}`);
  }
  
  if (newAttributes.groupName) {
    attributeLines.push(`Mikrotik-Group=${newAttributes.groupName}`);
  }
  
  if (attributeLines.length < 2) { // Need at least identifier + one attribute
    return {
      success: false,
      error: 'Need at least session identifier and one attribute to change',
    };
  }
  
  const attributes = attributeLines.join('\n');
  
  console.log(`[CoA] Sending CoA-Request to NAS ${host} for user: ${session.username}`);
  
  return executeRadclient(host, port, 'coa', secret, attributes);
}

/**
 * Disconnect a user session - sends to the correct NAS
 */
export async function disconnectUserSessions(
  username: string,
  sessions: SessionInfo[],
  options?: {
    port?: string;
    secret?: string;
  }
): Promise<CoAResult[]> {
  const results: CoAResult[] = [];
  
  for (const session of sessions) {
    // Send disconnect to the NAS that has this session
    const result = await sendDisconnectRequest(
      { ...session, username },
      {
        host: session.nasIpAddress, // Send to this specific NAS
        port: options?.port,
        secret: options?.secret || session.nasSecret,
      }
    );
    results.push(result);
    
    // If successful, no need to try other sessions for same user
    if (result.success) break;
  }
  
  if (sessions.length === 0) {
    results.push({
      success: false,
      error: 'No sessions provided - need nasIpAddress to send disconnect',
    });
  }
  
  return results;
}

/**
 * Apply profile changes to all active sessions of a user
 * This uses CoA to update attributes without disconnecting
 */
export async function applyProfileChangeToActiveSessions(
  username: string,
  sessions: SessionInfo[],
  newProfile: ProfileAttributes,
  options?: {
    port?: string;
    secret?: string;
    fallbackToDisconnect?: boolean;
  }
): Promise<{ success: boolean; results: CoAResult[]; action: 'coa' | 'disconnect' | 'none' }> {
  const results: CoAResult[] = [];
  let anySuccess = false;
  
  // Try CoA for each session - send to respective NAS
  for (const session of sessions) {
    const result = await sendCoARequest(
      { ...session, username },
      newProfile,
      {
        host: session.nasIpAddress, // Send to this specific NAS
        port: options?.port,
        secret: options?.secret || session.nasSecret,
      }
    );
    results.push(result);
    
    if (result.success) {
      anySuccess = true;
    }
  }
  
  if (sessions.length === 0) {
    results.push({
      success: false,
      error: 'No sessions provided - need nasIpAddress to send CoA',
    });
  }
  
  // If CoA failed and fallback is enabled, disconnect instead
  // User will reconnect and get new attributes
  if (!anySuccess && options?.fallbackToDisconnect && sessions.length > 0) {
    console.log(`[CoA] CoA failed, falling back to disconnect for user: ${username}`);
    
    const disconnectResults = await disconnectUserSessions(username, sessions, options);
    
    return {
      success: disconnectResults.some(r => r.success),
      results: disconnectResults,
      action: 'disconnect',
    };
  }
  
  return {
    success: anySuccess,
    results,
    action: anySuccess ? 'coa' : 'none',
  };
}

/**
 * Check if radclient is available on the system
 */
export async function isRadclientAvailable(): Promise<boolean> {
  try {
    await execAsync('which radclient');
    return true;
  } catch {
    return false;
  }
}

/**
 * Test CoA connection to a specific NAS (MikroTik)
 * This sends a test CoA to verify connectivity
 */
export async function testCoAConnection(options: {
  host: string;  // NAS IP (MikroTik) - REQUIRED
  port?: string;
  secret?: string;
}): Promise<CoAResult> {
  if (!options.host) {
    return {
      success: false,
      error: 'Host (NAS IP) is required for CoA test',
    };
  }
  
  const port = options.port || DEFAULT_COA_PORT;
  const secret = options.secret || DEFAULT_COA_SECRET;
  
  console.log(`[CoA] Testing connection to NAS ${options.host}:${port}`);
  
  // Send a test CoA with dummy user - this will likely get NAK but proves connectivity
  return executeRadclient(options.host, port, 'coa', secret, 'User-Name=__coa_test__');
}

/**
 * Test CoA to localhost (FreeRADIUS) - for basic radclient testing only
 */
export async function testLocalCoA(): Promise<CoAResult> {
  console.log(`[CoA] Testing local FreeRADIUS CoA (127.0.0.1:3799)`);
  return executeRadclient('127.0.0.1', '3799', 'coa', DEFAULT_COA_SECRET, 'User-Name=__test__');
}
